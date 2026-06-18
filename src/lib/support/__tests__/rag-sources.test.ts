import { describe, it, expect } from "vitest";
import { addKnowledge, knowledgeNamespace } from "../knowledge";
import { retrieveAcross } from "../retrieve";
import { getVectorStore } from "../vector-store";

describe("RAG upgrades — knowledge base + multi-namespace", () => {
  it("indexes a resolution and retrieves it across namespaces with citation metadata", async () => {
    await addKnowledge({
      kind: "resolution",
      title: "Stripe 402 on checkout",
      text: "Root cause: expired test card. Fix: rotate STRIPE_KEY and retry the charge endpoint.",
    });

    const { chunks } = await retrieveAcross([knowledgeNamespace()], "stripe charge failing 402", 5);
    expect(chunks.length).toBeGreaterThan(0);
    const top = chunks[0];
    expect(top.metadata.sourceType).toBe("resolution");
    expect(top.metadata.created_at).toBeTruthy();
    expect(top.metadata.source_name).toBeTruthy();
  });

  it("lists namespaces with vector counts", async () => {
    await addKnowledge({ kind: "runbook", title: "Deploy rollback", text: "Steps to roll back a bad deploy." });
    const store = getVectorStore();
    const namespaces = await store.listNamespaces();
    expect(namespaces.some((n) => n.namespace === knowledgeNamespace() && n.vectorCount > 0)).toBe(true);
  });

  it("deletes a namespace", async () => {
    const store = getVectorStore();
    await addKnowledge({ kind: "error-log", title: "temp", text: "transient" });
    await store.deleteNamespace(knowledgeNamespace());
    const namespaces = await store.listNamespaces();
    expect(namespaces.some((n) => n.namespace === knowledgeNamespace())).toBe(false);
  });
});
