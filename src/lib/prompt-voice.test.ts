import { describe, expect, it } from "vitest";
import {
  buildOrchestratorSystemPrompt,
  buildSynthesisVoicePrompt,
} from "./prompt-voice";
import { analyzeUserInput } from "./user-input-profile";

describe("prompt voice builders", () => {
  it("orchestrator prompt includes profile guidance and anti-leak rules", () => {
    const profile = analyzeUserInput("please explain the error in my API");
    const prompt = buildOrchestratorSystemPrompt(profile);
    expect(prompt).toContain("communication profile");
    expect(prompt).toContain("Never quote, paraphrase");
    expect(prompt).not.toContain("anaphoric accumulation");
    expect(prompt).not.toContain("blunt profanity");
  });

  it("synthesis voice omits performative script bullets", () => {
    const profile = analyzeUserInput("I'm stressed and need help");
    const voice = buildSynthesisVoicePrompt(profile);
    expect(voice).not.toContain("anaphoric accumulation");
    expect(voice).not.toContain("blunt profanity");
    expect(voice).not.toContain("emotional collapse");
    expect(voice).not.toContain("mix high diction");
    expect(voice).toContain("therapy");
  });

  it("tailors blunt profile to direct guidance", () => {
    const profile = analyzeUserInput("tldr fix my bug");
    const voice = buildSynthesisVoicePrompt(profile);
    expect(voice.toLowerCase()).toMatch(/direct|compact|preamble/);
  });

  it("requires decision matrix for full-council compare", () => {
    const profile = analyzeUserInput(
      "Compare Neon versus Supabase for year one and migration triggers",
    );
    const voice = buildSynthesisVoicePrompt(profile, undefined, profile.query, [
      "full-council-eval",
      "compare",
    ]);
    expect(voice).toMatch(/decision matrix/i);
    expect(voice).toMatch(/year one/i);
    expect(voice).toMatch(/switching away/i);
  });
});

