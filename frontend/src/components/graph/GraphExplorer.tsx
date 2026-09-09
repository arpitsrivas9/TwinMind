"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  EntityType,
  GraphEntity,
  GraphRelationship,
  GraphOverview,
  listGraphEntities,
  getGraphOverview,
  getGraphEntity,
  createGraphEntity,
  deleteGraphEntity,
  queryGraphTraversal,
  createGraphRelationship,
  deleteGraphRelationship,
} from "../../lib/api";

const ENTITY_TYPE_CONFIG: Record<
  EntityType,
  { label: string; icon: string; color: string; border: string; bg: string; text: string }
> = {
  PROJECT: {
    label: "Project",
    icon: "🚀",
    color: "#22d3ee",
    border: "border-cyan-500/40",
    bg: "bg-cyan-950/30",
    text: "text-cyan-200",
  },
  TOPIC: {
    label: "Topic",
    icon: "💡",
    color: "#f59e0b",
    border: "border-amber-500/40",
    bg: "bg-amber-950/30",
    text: "text-amber-200",
  },
  DOCUMENT: {
    label: "Document",
    icon: "📕",
    color: "#38bdf8",
    border: "border-sky-500/40",
    bg: "bg-sky-950/30",
    text: "text-sky-200",
  },
  TASK: {
    label: "Task",
    icon: "✓",
    color: "#34d399",
    border: "border-emerald-500/40",
    bg: "bg-emerald-950/30",
    text: "text-emerald-200",
  },
  GOAL: {
    label: "Goal",
    icon: "🎯",
    color: "#c084fc",
    border: "border-purple-500/40",
    bg: "bg-purple-950/30",
    text: "text-purple-200",
  },
  MEETING: {
    label: "Meeting",
    icon: "👥",
    color: "#fb7185",
    border: "border-rose-500/40",
    bg: "bg-rose-950/30",
    text: "text-rose-200",
  },
  PERSON: {
    label: "Person",
    icon: "👤",
    color: "#818cf8",
    border: "border-indigo-500/40",
    bg: "bg-indigo-950/30",
    text: "text-indigo-200",
  },
  MEMORY: {
    label: "Memory",
    icon: "◌",
    color: "#2dd4bf",
    border: "border-teal-500/40",
    bg: "bg-teal-950/30",
    text: "text-teal-200",
  },
  CONVERSATION: {
    label: "Conversation",
    icon: "💬",
    color: "#a3e635",
    border: "border-lime-500/40",
    bg: "bg-lime-950/30",
    text: "text-lime-200",
  },
  ORGANIZATION: {
    label: "Organization",
    icon: "🏢",
    color: "#fb923c",
    border: "border-orange-500/40",
    bg: "bg-orange-950/30",
    text: "text-orange-200",
  },
  USER: {
    label: "Owner",
    icon: "👑",
    color: "#e879f9",
    border: "border-fuchsia-500/40",
    bg: "bg-fuchsia-950/30",
    text: "text-fuchsia-200",
  },
};

export function GraphExplorer() {
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [overview, setOverview] = useState<GraphOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<EntityType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Detailed selected entity inspector
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [entityRelationships, setEntityRelationships] = useState<GraphRelationship[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add entity modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newType, setNewType] = useState<EntityType>("PROJECT");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [savingEntity, setSavingEntity] = useState(false);

  // Connect entity modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTargetId, setConnectTargetId] = useState("");
  const [connectType, setConnectType] = useState<string>("RELATED_TO");
  const [savingRel, setSavingRel] = useState(false);

  const fetchGraphData = async () => {
    try {
      setLoading(true);
      const [ov, ent] = await Promise.all([
        getGraphOverview().catch(() => null),
        listGraphEntities({ limit: 100 }).catch(() => ({ entities: [], total: 0 })),
      ]);
      setOverview(ov);
      setEntities(ent.entities);

      // Auto-select first entity if none selected
      if (!selectedEntity && ent.entities.length > 0) {
        inspectEntity(ent.entities[0]);
      }
    } catch {
      // Ignore initial load error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, []);

  const inspectEntity = async (entity: GraphEntity) => {
    setSelectedEntity(entity);
    setLoadingDetail(true);
    try {
      const res = await getGraphEntity(entity.id);
      setEntityRelationships(res.relationships || []);
    } catch {
      setEntityRelationships([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || savingEntity) return;

    setSavingEntity(true);
    try {
      const created = await createGraphEntity({
        type: newType,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setShowAddModal(false);
      setNewName("");
      setNewDesc("");
      await fetchGraphData();
      inspectEntity(created);
    } catch {
      // Ignore
    } finally {
      setSavingEntity(false);
    }
  };

  const handleDeleteEntity = async (id: string) => {
    try {
      await deleteGraphEntity(id);
      setSelectedEntity(null);
      setEntityRelationships([]);
      await fetchGraphData();
    } catch {
      // Ignore
    }
  };

  const handleConnectRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntity || !connectTargetId || savingRel) return;

    setSavingRel(true);
    try {
      await createGraphRelationship({
        sourceEntityId: selectedEntity.id,
        targetEntityId: connectTargetId,
        type: connectType as any,
      });
      setShowConnectModal(false);
      inspectEntity(selectedEntity);
    } catch {
      // Ignore
    } finally {
      setSavingRel(false);
    }
  };

  const handleDeleteRelationship = async (id: string) => {
    try {
      await deleteGraphRelationship(id);
      if (selectedEntity) inspectEntity(selectedEntity);
    } catch {
      // Ignore
    }
  };

  const filteredEntities = useMemo(() => {
    return entities.filter((e) => {
      const matchesType = selectedType === "ALL" || e.type === selectedType;
      const matchesSearch =
        !searchQuery.trim() ||
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesType && matchesSearch;
    });
  }, [entities, selectedType, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header with Overview Stats */}
      <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary tracking-tight">
              TwinGraph™ Knowledge Network
            </h2>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
              Active Graph
            </span>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Structured relational map connecting projects, documents, tasks, goals, meetings, and topics across TwinMind.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-1/60 px-3 py-1.5 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span className="font-semibold text-cyan-200">{overview?.totalEntities || entities.length}</span> Entities
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-cyan-200">{overview?.totalRelationships || 0}</span> Relationships
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-accent-cyan px-3.5 py-1.5 text-xs font-semibold text-surface-0 transition-opacity hover:opacity-90"
          >
            + Add Entity
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedType("ALL")}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedType === "ALL"
                ? "bg-cyan-500/10 text-cyan-200 border border-cyan-500/30"
                : "text-text-muted hover:text-text-primary hover:bg-surface-2"
            }`}
          >
            All ({entities.length})
          </button>
          {(
            [
              "PROJECT",
              "TOPIC",
              "DOCUMENT",
              "TASK",
              "GOAL",
              "MEETING",
              "PERSON",
            ] as EntityType[]
          ).map((t) => {
            const count = entities.filter((e) => e.type === t).length;
            if (count === 0 && selectedType !== t) return null;
            const cfg = ENTITY_TYPE_CONFIG[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedType === t
                    ? `${cfg.bg} ${cfg.text} border ${cfg.border}`
                    : "text-text-muted hover:text-text-primary hover:bg-surface-2"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities & connections…"
            className="w-full rounded-lg border border-border-default bg-surface-1 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus-visible:border-accent-cyan focus-visible:outline-none"
          />
        </div>
      </div>

      {/* Main Split View: Left Node Grid + Right Entity Detail Drawer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Entities List & Visual Cards */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-xs text-text-muted">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mr-2" />
              Loading knowledge graph network…
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface-1/40 p-8 text-center">
              <p className="text-sm font-medium text-text-secondary">No entities found</p>
              <p className="mt-1 text-xs text-text-muted">
                Entities are automatically extracted as you chat, save memories, and upload documents.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredEntities.map((entity) => {
                const cfg = ENTITY_TYPE_CONFIG[entity.type] || ENTITY_TYPE_CONFIG.TOPIC;
                const isSelected = selectedEntity?.id === entity.id;

                return (
                  <button
                    key={entity.id}
                    type="button"
                    onClick={() => inspectEntity(entity)}
                    className={`text-left rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-cyan-400 bg-surface-2/80 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                        : "border-border-subtle bg-surface-1/60 hover:bg-surface-2/40 hover:border-border-default"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden="true">
                          {cfg.icon}
                        </span>
                        <span className="text-xs font-semibold text-text-primary leading-tight">
                          {entity.name}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    {entity.description && (
                      <p className="mt-2 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                        {entity.description}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-between text-[10px] text-text-muted border-t border-border-subtle/40 pt-2">
                      <span>{Math.round(entity.confidence * 100)}% Confidence</span>
                      <span className="text-accent-cyan">Inspect &rarr;</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Entity Detail Inspector Drawer */}
        <div className="rounded-xl border border-border-subtle bg-surface-1/80 p-5 space-y-5">
          {selectedEntity ? (
            <>
              {/* Entity Header */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      ENTITY_TYPE_CONFIG[selectedEntity.type]?.bg
                    } ${ENTITY_TYPE_CONFIG[selectedEntity.type]?.text} border ${
                      ENTITY_TYPE_CONFIG[selectedEntity.type]?.border
                    }`}
                  >
                    <span>{ENTITY_TYPE_CONFIG[selectedEntity.type]?.icon}</span>
                    <span>{ENTITY_TYPE_CONFIG[selectedEntity.type]?.label}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDeleteEntity(selectedEntity.id)}
                    className="text-xs text-text-muted hover:text-rose-400 p-1 rounded hover:bg-surface-2"
                    title="Delete entity and connected relationships"
                  >
                    🗑️ Delete
                  </button>
                </div>

                <h3 className="mt-2 text-base font-semibold text-text-primary">
                  {selectedEntity.name}
                </h3>
                {selectedEntity.description && (
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed">
                    {selectedEntity.description}
                  </p>
                )}
              </div>

              {/* Connected Relationships Section */}
              <div className="space-y-3 border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-text-muted tracking-wider uppercase">
                    Connected Relationships ({entityRelationships.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(true)}
                    className="text-[11px] text-accent-cyan hover:underline"
                  >
                    + Link Entity
                  </button>
                </div>

                {loadingDetail ? (
                  <div className="py-6 text-center text-xs text-text-muted">
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mr-2" />
                    Tracing connections…
                  </div>
                ) : entityRelationships.length === 0 ? (
                  <p className="text-xs text-text-muted italic">
                    No direct relationships currently attached to this entity.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {entityRelationships.map((rel) => {
                      const isSource = rel.sourceEntityId === selectedEntity.id;
                      const partner = isSource ? rel.targetEntity : rel.sourceEntity;
                      const partnerCfg = partner
                        ? ENTITY_TYPE_CONFIG[partner.type]
                        : ENTITY_TYPE_CONFIG.TOPIC;

                      return (
                        <div
                          key={rel.id}
                          className="rounded-lg border border-border-subtle bg-surface-2/40 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[10px] text-cyan-300">
                              {isSource ? `→ ${rel.type}` : `← ${rel.type}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteRelationship(rel.id)}
                              className="text-[10px] text-text-muted hover:text-rose-400"
                              title="Delete relationship"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span>{partnerCfg?.icon}</span>
                            <button
                              type="button"
                              onClick={() => partner && inspectEntity(partner)}
                              className="font-medium text-text-primary hover:text-accent-cyan truncate text-left"
                            >
                              {partner?.name || "Unknown"}
                            </button>
                          </div>

                          {rel.sourceType && (
                            <p className="text-[10px] text-text-muted">
                              Evidence: {rel.sourceType}
                              {rel.sourceId ? ` (${rel.sourceId.slice(0, 8)}…)` : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-text-muted">
              Select any entity from the knowledge map to inspect its connections and provenance.
            </div>
          )}
        </div>
      </div>

      {/* Add Entity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-1 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">Add New Knowledge Entity</h3>
            <form onSubmit={handleCreateEntity} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Entity Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as EntityType)}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus-visible:outline-none"
                >
                  <option value="PROJECT">Project</option>
                  <option value="TOPIC">Topic</option>
                  <option value="TASK">Task</option>
                  <option value="GOAL">Goal</option>
                  <option value="MEETING">Meeting</option>
                  <option value="PERSON">Person</option>
                  <option value="ORGANIZATION">Organization</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Entity Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. TwinMind, Authentication, Launch MVP"
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus-visible:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Description (Optional)</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Brief context or notes about this entity..."
                  rows={2}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus-visible:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEntity || !newName.trim()}
                  className="rounded-lg bg-accent-cyan px-4 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50"
                >
                  {savingEntity ? "Saving…" : "Save Entity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Relationship Modal */}
      {showConnectModal && selectedEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border-default bg-surface-1 p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Link &ldquo;{selectedEntity.name}&rdquo; to Another Entity
            </h3>
            <form onSubmit={handleConnectRelationship} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Relationship Type</label>
                <select
                  value={connectType}
                  onChange={(e) => setConnectType(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus-visible:outline-none"
                >
                  <option value="RELATED_TO">RELATED_TO</option>
                  <option value="WORKS_ON">WORKS_ON</option>
                  <option value="HAS_TASK">HAS_TASK</option>
                  <option value="HAS_GOAL">HAS_GOAL</option>
                  <option value="HAS_DOCUMENT">HAS_DOCUMENT</option>
                  <option value="REFERENCES">REFERENCES</option>
                  <option value="DEPENDS_ON">DEPENDS_ON</option>
                  <option value="ABOUT">ABOUT</option>
                  <option value="SUPPORTS">SUPPORTS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Target Entity</label>
                <select
                  value={connectTargetId}
                  onChange={(e) => setConnectTargetId(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus-visible:outline-none"
                  required
                >
                  <option value="">Select an entity…</option>
                  {entities
                    .filter((e) => e.id !== selectedEntity.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {ENTITY_TYPE_CONFIG[e.type]?.icon} {e.name} ({ENTITY_TYPE_CONFIG[e.type]?.label})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRel || !connectTargetId}
                  className="rounded-lg bg-accent-cyan px-4 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50"
                >
                  {savingRel ? "Linking…" : "Create Relationship"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

