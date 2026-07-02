"use client";

export function FeatureRemovedEditor({
  feature,
  alternatives,
}: {
  feature: string;
  alternatives: string[];
}) {
  return (
    <div
      className="p-8 max-w-xl"
      data-testid="feature-removed-notice"
    >
      <h2 className="text-xl font-semibold mb-3">{feature} removed</h2>
      <p className="text-sm leading-6 text-[var(--muted)] mb-4">
        The app-building workflow has been removed from AI Support Agent. You can still ask about
        Cyware APIs, CQL, support issues, and developer handoffs in the main chat.
      </p>
      <p className="text-sm font-medium mb-2">Try instead:</p>
      <ul className="text-sm list-disc pl-5 space-y-1 text-[var(--muted)]">
        {alternatives.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
