import { EmptyState } from "../../components/EmptyState";

export function ImportPlaceholder(): JSX.Element {
  return (
    <EmptyState
      title="Magic Import (Coming Soon)"
      description="Text, PDF, and image import flows are planned for v0.4 and beyond."
    />
  );
}
