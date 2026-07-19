import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

type Person = {
  id: string;
  displayName: string;
  role: "adult" | "child";
  color: string;
};

type HouseholdResponse = {
  household: {
    name: string;
    timezone: string;
    weekStartsOn: "sunday" | "monday";
    locationName: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  people: Person[];
};

type LocationCandidate = {
  id: number;
  name: string;
  displayName: string;
  label: string;
  latitude: number;
  longitude: number;
};

const defaultMember: Omit<Person, "id"> = {
  displayName: "",
  role: "child",
  color: "#0f766e"
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function FamilySettings(): JSX.Element {
  const queryClient = useQueryClient();
  const familyQuery = useQuery({
    queryKey: queryKeys.householdSettings,
    queryFn: () => apiFetch<HouseholdResponse>("/household/current")
  });
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [weekStartsOn, setWeekStartsOn] = useState<"sunday" | "monday">("monday");
  const [locationName, setLocationName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationResults, setLocationResults] = useState<LocationCandidate[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [newMember, setNewMember] = useState(defaultMember);
  const [familyStatus, setFamilyStatus] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [isSavingFamily, setIsSavingFamily] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  useEffect(() => {
    if (familyQuery.data) {
      setName(familyQuery.data.household.name);
      setTimezone(familyQuery.data.household.timezone);
      setWeekStartsOn(familyQuery.data.household.weekStartsOn ?? "monday");
      setLocationName(
        (familyQuery.data.household.locationName ?? "").replace(/, United States$/, "")
      );
      setLatitude(familyQuery.data.household.latitude?.toString() ?? "");
      setLongitude(familyQuery.data.household.longitude?.toString() ?? "");
    }
  }, [familyQuery.data]);

  const refreshFamilyConsumers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.householdSettings }),
      queryClient.invalidateQueries({ queryKey: queryKeys.household }),
      queryClient.invalidateQueries({ queryKey: queryKeys.rewardBalances }),
      queryClient.invalidateQueries({ queryKey: ["household-people-for-calendar"] }),
      queryClient.invalidateQueries({ queryKey: ["current-weather"] })
    ]);
  };

  if (familyQuery.isLoading) return <LoadingState label="Loading family settings..." />;
  if (familyQuery.isError) return <ErrorState message={familyQuery.error.message} />;

  return (
    <section className="grid gap-5 rounded-2xl border border-[#e0d6c7] bg-white p-4 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Your household</p>
        <h2 className="mt-1 font-display text-3xl text-slate-950">Family</h2>
        <p className="mt-1 text-sm text-slate-600">Update the name shown around Daymark and manage who belongs to the family.</p>
      </div>

      <form
        className="grid gap-3 rounded-xl bg-[#faf8f4] p-4 sm:grid-cols-2 sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          if (locationName.trim() && (!latitude || !longitude)) {
            setFamilyStatus("Choose a city from the search results before saving.");
            return;
          }
          setIsSavingFamily(true);
          setFamilyStatus(null);
          try {
            await apiFetch("/household/current", {
              method: "PATCH",
              body: JSON.stringify({
                name,
                timezone,
                weekStartsOn,
                locationName: locationName.trim() || null,
                latitude: latitude === "" ? null : Number(latitude),
                longitude: longitude === "" ? null : Number(longitude)
              })
            });
            await refreshFamilyConsumers();
            setFamilyStatus("Family details saved.");
          } catch (error) {
            setFamilyStatus(errorMessage(error));
          } finally {
            setIsSavingFamily(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Family name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Time zone
          <input
            required
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
            placeholder="America/Los_Angeles"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          First day of week
          <select
            value={weekStartsOn}
            onChange={(event) => setWeekStartsOn(event.target.value as "sunday" | "monday")}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Weather city
          <input
            value={locationName}
            onChange={(event) => {
              setLocationName(event.target.value);
              setLatitude("");
              setLongitude("");
              setLocationResults([]);
            }}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
            placeholder="Los Angeles"
          />
        </label>
        <button
          type="button"
          className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-4 text-sm font-semibold text-slate-700"
          disabled={isSearchingLocation || locationName.trim().length < 2}
          onClick={async () => {
            setIsSearchingLocation(true);
            setFamilyStatus(null);
            try {
              const response = await apiFetch<{ locations: LocationCandidate[] }>(
                `/weather/locations?query=${encodeURIComponent(locationName.trim())}`
              );
              setLocationResults(response.locations);
              if (!response.locations.length) setFamilyStatus("No matching cities found.");
            } catch (error) {
              setFamilyStatus(errorMessage(error));
            } finally {
              setIsSearchingLocation(false);
            }
          }}
        >
          {isSearchingLocation ? "Searching…" : "Find city"}
        </button>
        {locationResults.length ? (
          <div className="grid gap-1 rounded-lg border border-[#d8cbb8] bg-white p-2 sm:col-span-2">
            {locationResults.map((location) => (
              <button
                key={location.id}
                type="button"
                className="min-h-[40px] rounded-md px-3 text-left text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  setLocationName(location.displayName);
                  setLatitude(String(location.latitude));
                  setLongitude(String(location.longitude));
                  setLocationResults([]);
                  setFamilyStatus(`${location.displayName} selected. Save family to apply it.`);
                }}
              >
                {location.label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSavingFamily}
          className="min-h-[44px] rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:justify-self-end"
        >
          {isSavingFamily ? "Saving…" : "Save family"}
        </button>
        {familyStatus ? <p role="status" className="text-sm text-slate-600 sm:col-span-2">{familyStatus}</p> : null}
      </form>

      <div className="grid gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Family members</h3>
          <p className="text-sm text-slate-600">Names and colors are used across calendars, tasks, and rewards.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {familyQuery.data?.people.map((person) => (
            <MemberEditor key={person.id} person={person} onSaved={refreshFamilyConsumers} />
          ))}
        </div>
      </div>

      <form
        aria-label="Add family member"
        className="grid gap-3 rounded-xl border border-dashed border-[#cfc3b1] bg-[#fffdf9] p-4 sm:grid-cols-[1fr_140px_80px_auto] sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsAddingMember(true);
          setAddStatus(null);
          try {
            await apiFetch("/household/people", {
              method: "POST",
              body: JSON.stringify(newMember)
            });
            setNewMember(defaultMember);
            await refreshFamilyConsumers();
            setAddStatus("Family member added.");
          } catch (error) {
            setAddStatus(errorMessage(error));
          } finally {
            setIsAddingMember(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          New member name
          <input
            required
            maxLength={120}
            value={newMember.displayName}
            onChange={(event) => setNewMember((value) => ({ ...value, displayName: event.target.value }))}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Role
          <select
            value={newMember.role}
            onChange={(event) => setNewMember((value) => ({ ...value, role: event.target.value as "adult" | "child" }))}
            className="min-h-[44px] rounded-lg border border-[#d8cbb8] bg-white px-3 font-normal text-slate-900"
          >
            <option value="child">Child</option>
            <option value="adult">Adult</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Color
          <input
            aria-label="New member color"
            type="color"
            value={newMember.color}
            onChange={(event) => setNewMember((value) => ({ ...value, color: event.target.value }))}
            className="h-[44px] w-full rounded-lg border border-[#d8cbb8] bg-white p-1"
          />
        </label>
        <button
          type="submit"
          disabled={isAddingMember}
          className="min-h-[44px] rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isAddingMember ? "Adding…" : "Add member"}
        </button>
        {addStatus ? <p role="status" className="text-sm text-slate-600 sm:col-span-4">{addStatus}</p> : null}
      </form>
    </section>
  );
}

function MemberEditor({ person, onSaved }: { person: Person; onSaved: () => Promise<void> }): JSX.Element {
  const [displayName, setDisplayName] = useState(person.displayName);
  const [role, setRole] = useState(person.role);
  const [color, setColor] = useState(person.color);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayName(person.displayName);
    setRole(person.role);
    setColor(person.color);
  }, [person]);

  return (
    <form
      aria-label={`Edit ${person.displayName}`}
      className="grid grid-cols-[52px_1fr_auto] gap-3 rounded-xl border border-[#e8e0d4] p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setStatus(null);
        try {
          await apiFetch(`/household/people/${person.id}`, {
            method: "PATCH",
            body: JSON.stringify({ displayName, role, color })
          });
          await onSaved();
          setStatus("Saved.");
        } catch (error) {
          setStatus(errorMessage(error));
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <input
        aria-label={`${person.displayName} color`}
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        className="h-[52px] w-[52px] rounded-full border-0 bg-transparent p-0"
      />
      <div className="grid gap-2">
        <label className="sr-only" htmlFor={`member-name-${person.id}`}>Member name</label>
        <input
          id={`member-name-${person.id}`}
          required
          maxLength={120}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="min-h-[40px] rounded-lg border border-[#d8cbb8] px-3 font-semibold text-slate-900"
        />
        <label className="sr-only" htmlFor={`member-role-${person.id}`}>Role</label>
        <select
          id={`member-role-${person.id}`}
          value={role}
          onChange={(event) => setRole(event.target.value as "adult" | "child")}
          className="min-h-[40px] rounded-lg border border-[#d8cbb8] bg-white px-3 text-sm text-slate-700"
        >
          <option value="adult">Adult</option>
          <option value="child">Child</option>
        </select>
        {status ? <p role="status" className="text-xs text-slate-600">{status}</p> : null}
      </div>
      <button
        type="submit"
        disabled={isSaving}
        className="min-h-[40px] self-start rounded-lg border border-[#d8cbb8] bg-[#fff7ea] px-3 text-sm font-semibold text-slate-800 disabled:opacity-60"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
