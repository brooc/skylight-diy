import { households, listItems, lists } from "@daymark/db";
import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const createListBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional()
});

const createListItemBodySchema = z.object({
  title: z.string().trim().min(1).max(180)
});

const updateListItemBodySchema = z.object({
  completed: z.boolean()
});

export const listsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/lists", async () => {
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return { lists: [] };
    }

    const listRows = await app.db
      .select({
        id: lists.id,
        title: lists.title,
        color: lists.color,
        sortOrder: lists.sortOrder
      })
      .from(lists)
      .where(eq(lists.householdId, household.id))
      .orderBy(asc(lists.sortOrder), asc(lists.createdAt));

    const itemRows = await app.db
      .select({
        id: listItems.id,
        listId: listItems.listId,
        title: listItems.title,
        completed: listItems.completed,
        sortOrder: listItems.sortOrder
      })
      .from(listItems)
      .where(eq(listItems.householdId, household.id))
      .orderBy(asc(listItems.sortOrder), asc(listItems.createdAt));

    const itemsByList = new Map<string, Array<(typeof itemRows)[number]>>();
    for (const item of itemRows) {
      itemsByList.set(item.listId, [...(itemsByList.get(item.listId) ?? []), item]);
    }

    return {
      lists: listRows.map((list) => ({
        ...list,
        items: itemsByList.get(list.id) ?? []
      }))
    };
  });

  app.post("/lists", async (request, reply) => {
    const parsed = createListBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const [lastList] = await app.db
      .select({ sortOrder: lists.sortOrder })
      .from(lists)
      .where(eq(lists.householdId, household.id))
      .orderBy(desc(lists.sortOrder))
      .limit(1);
    const nextSortOrder = (lastList?.sortOrder ?? -1) + 1;

    const [created] = await app.db
      .insert(lists)
      .values({
        householdId: household.id,
        title: parsed.data.title,
        color: parsed.data.color ?? null,
        sortOrder: nextSortOrder
      })
      .returning({
        id: lists.id,
        title: lists.title,
        color: lists.color,
        sortOrder: lists.sortOrder
      });

    return reply.status(201).send({ list: created });
  });

  app.post("/lists/:listId/items", async (request, reply) => {
    const parsed = createListItemBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const listId = (request.params as { listId: string }).listId;
    const [listRow] = await app.db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, listId), eq(lists.householdId, household.id)))
      .limit(1);
    if (!listRow) {
      return reply.status(404).send({ error: "list_not_found" });
    }

    const [lastItem] = await app.db
      .select({ sortOrder: listItems.sortOrder })
      .from(listItems)
      .where(and(eq(listItems.householdId, household.id), eq(listItems.listId, listId)))
      .orderBy(desc(listItems.sortOrder))
      .limit(1);
    const nextSortOrder = (lastItem?.sortOrder ?? -1) + 1;

    const [created] = await app.db
      .insert(listItems)
      .values({
        householdId: household.id,
        listId,
        title: parsed.data.title,
        completed: false,
        sortOrder: nextSortOrder
      })
      .returning({
        id: listItems.id,
        listId: listItems.listId,
        title: listItems.title,
        completed: listItems.completed,
        sortOrder: listItems.sortOrder
      });

    return reply.status(201).send({ item: created });
  });

  app.patch("/lists/:listId/items/:itemId", async (request, reply) => {
    const parsed = updateListItemBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten()
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }

    const params = request.params as { listId: string; itemId: string };
    const [updated] = await app.db
      .update(listItems)
      .set({
        completed: parsed.data.completed,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(listItems.id, params.itemId),
          eq(listItems.listId, params.listId),
          eq(listItems.householdId, household.id)
        )
      )
      .returning({
        id: listItems.id,
        listId: listItems.listId,
        title: listItems.title,
        completed: listItems.completed
      });

    if (!updated) {
      return reply.status(404).send({ error: "list_item_not_found" });
    }

    return { item: updated };
  });
};
