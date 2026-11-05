import { describe, expect, it } from "vitest";
import { emptyKnowledge, knowledgePayload, type KnowledgeFile } from "./knowledge";

const file = (over: Partial<KnowledgeFile> = {}): KnowledgeFile => ({
  id: "k1",
  name: "设定集.md",
  text: "人物：小林",
  created: 0,
  active: true,
  ...over,
});

describe("knowledge payload", () => {
  it("sends only enabled files and keeps the outline separate", () => {
    const state = {
      prompt: "  按设定集统一人名  ",
      files: [file(), file({ id: "k2", name: "停用.txt", active: false })],
    };
    const payload = knowledgePayload(state);
    expect(payload.system).toBe("按设定集统一人名");
    expect(payload.knowledge).toContain("设定集.md");
    expect(payload.knowledge).toContain("人物：小林");
    expect(payload.knowledge).not.toContain("停用.txt");
  });

  it("returns the outline alone when nothing is enabled", () => {
    expect(knowledgePayload({ ...emptyKnowledge(), prompt: "大纲" })).toEqual({
      system: "大纲",
      knowledge: "",
    });
  });

  it("escapes names and truncates oversized files without dropping the note", () => {
    const payload = knowledgePayload({
      prompt: "",
      files: [file({ name: 'a".md', text: "字".repeat(70_000) })],
    });
    expect(payload.knowledge).toContain('文件="a\'.md"');
    expect(payload.knowledge).toContain("已截断");
    expect(payload.knowledge.length).toBeLessThan(61_000);
  });
});
