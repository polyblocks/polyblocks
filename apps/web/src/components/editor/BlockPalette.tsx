/**
 * BlockPalette — left sidebar with draggable block categories.
 * Drag a block onto the canvas to add it.
 */

import { useState, type DragEvent } from "react";
import {
  BlockType,
  NodeCategory,
  BLOCK_REGISTRY,
} from "@polyblocks/types";
import { Input } from "@polyblocks/ui";
import * as Icons from "lucide-react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

function getIcon(iconName: string, size = 16) {
  const name = iconName
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<{ size: number }>>)[name];
  return IconComponent ? <IconComponent size={size} /> : null;
}

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  [NodeCategory.Trigger]: "Triggers",
  [NodeCategory.Market]: "Market",
  [NodeCategory.Data]: "Data",
  [NodeCategory.Logic]: "Logic",
  [NodeCategory.Risk]: "Risk",
  [NodeCategory.Action]: "Actions",
  [NodeCategory.Utility]: "Utility",
};

const CATEGORY_ORDER: NodeCategory[] = [
  NodeCategory.Trigger,
  NodeCategory.Market,
  NodeCategory.Data,
  NodeCategory.Logic,
  NodeCategory.Risk,
  NodeCategory.Action,
  NodeCategory.Utility,
];

export default function BlockPalette() {
  const [search, setSearch] = useState("");
  const isPro = useAuthStore((s) => s.isPro);
  const navigate = useNavigate();

  /** Blocks that require Pro */
  const PRO_BLOCKS = new Set<BlockType>([BlockType.UserActivity]);

  /** Blocks with Beta badge */
  const BETA_BLOCKS = new Set<BlockType>([BlockType.CustomApiData]);

  const allBlocks = Object.values(BLOCK_REGISTRY);
  const filtered = search
    ? allBlocks.filter(
        (b) =>
          b.label.toLowerCase().includes(search.toLowerCase()) ||
          b.description.toLowerCase().includes(search.toLowerCase()),
      )
    : allBlocks;

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    blocks: filtered.filter((b) => b.category === cat),
  })).filter((g) => g.blocks.length > 0);

  const onDragStart = (event: DragEvent, blockType: BlockType) => {
    event.dataTransfer.setData("application/polyblocks-block", blockType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="block-palette">
      <div className="block-palette-header">
        <h3>Blocks</h3>
      </div>
      <div className="block-palette-search">
        <Input
          placeholder="Search blocks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="block-palette-list">
        {byCategory.map((group) => (
          <div key={group.category} className="block-palette-category">
            <div className="block-palette-category-label">{group.label}</div>
            {group.blocks.map((block) => {
              const isLocked = PRO_BLOCKS.has(block.type) && !isPro();
              return (
                <div
                  key={block.type}
                  className={`block-palette-item${isLocked ? " locked" : ""}`}
                  draggable={!isLocked}
                  onDragStart={(e) => !isLocked && onDragStart(e, block.type)}
                  onClick={() => isLocked && navigate("/pricing")}
                  title={isLocked ? "Pro feature — click to upgrade" : block.description}
                  style={isLocked ? { opacity: 0.6, cursor: "pointer" } : undefined}
                >
                  <div
                    className="icon-box"
                    style={{
                      background: `${block.color}20`,
                      color: block.color,
                    }}
                  >
                    {getIcon(block.icon)}
                  </div>
                  <span>{block.label}</span>
                  {isLocked && (
                    <Lock size={12} style={{ marginLeft: "auto", color: "var(--pb-text-muted)" }} />
                  )}
                  {BETA_BLOCKS.has(block.type) && !isLocked && (
                    <span className="block-beta-badge">BETA</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
