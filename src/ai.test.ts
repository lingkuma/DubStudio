import { describe, expect, it, vi } from "vitest";
vi.mock("./providers", () => ({ api: vi.fn() }));
import { api } from "./providers";
import { askAI } from "./ai";
import { blankProject, restoreSettings } from "./model";

const reply = { choices: [{ message: { content: '{"reply":"收到","edits":[],"actions":[]}' } }] };
const settings = () => ({ ...restoreSettings(null), aiKey: "test-key" });

function sent() {
  return (vi.mocked(api).mock.calls.at(-1)![2] as any).payload.messages as {
    role: string;
    content: string;
  }[];
}

describe("askAI knowledge context", () => {
  it("adds the outline and enabled knowledge as separate system messages", async () => {
    vi.mocked(api).mockResolvedValue(reply);
    await askAI(blankProject(), settings(), "改写全文", undefined, {
      system: "按设定集统一人名",
      knowledge: "<知识库 文件=\"a.md\">\n小林\n</知识库>",
    });
    const messages = sent();
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("当前工程：");
    expect(messages[1]).toMatchObject({ role: "system" });
    expect(messages[1].content).toContain("按设定集统一人名");
    expect(messages[2]).toMatchObject({ role: "system" });
    expect(messages[2].content).toContain("小林");
    expect(messages.at(-1)).toEqual({ role: "user", content: "改写全文" });
  });

  it("keeps the original message order when nothing is attached", async () => {
    vi.mocked(api).mockResolvedValue(reply);
    await askAI(blankProject(), settings(), "改写全文", undefined, {
      system: "  ",
      knowledge: "",
    });
    const messages = sent();
    expect(messages.map((m) => m.role)).toEqual(["system", "user"]);
  });
});
