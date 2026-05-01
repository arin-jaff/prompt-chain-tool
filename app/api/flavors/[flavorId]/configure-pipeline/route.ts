import { requireAdmin } from "@/lib/auth";
import { TABLES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ flavorId: string }> };

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Follow the user's instructions precisely and concisely. Output only what is requested, with no preamble or commentary.";

const DEFAULT_FINAL_SYSTEM_PROMPT =
  "You write captions in a specific humor style. Return ONLY a valid JSON array of caption strings, with no preamble, no commentary, no markdown — just the raw JSON array.";

const VISION_MODEL_ID = 1; // GPT-4.1 (vision-capable)

const INPUT_TYPE_IMAGE = 1;
const INPUT_TYPE_TEXT = 2;
const OUTPUT_TYPE_TEXT = 1;
const OUTPUT_TYPE_JSON = 2;

const STEP_TYPE_IDENTIFY = 1;
const STEP_TYPE_DESCRIBE = 2;
const STEP_TYPE_GENERATE = 3;

type StepRow = {
  id: string | number;
  order_by: number;
  llm_user_prompt: string | null;
  llm_system_prompt: string | null;
  llm_model_id: number | null;
};

function ensureChainReference(userPrompt: string, previousOrder: number): string {
  const chainToken = `\${step${previousOrder}Output}`;
  if (userPrompt.includes(chainToken) || /\$\{step\d+Output\}/.test(userPrompt)) {
    return userPrompt;
  }
  return `Previous step output:\n${chainToken}\n\n${userPrompt}`;
}

export async function POST(_: Request, { params }: Params) {
  const { user, error } = await requireAdmin();
  if (error) {
    return error;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { flavorId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: steps, error: readError } = await supabase
    .from(TABLES.flavorSteps)
    .select("id, order_by, llm_user_prompt, llm_system_prompt, llm_model_id")
    .eq("humor_flavor_id", flavorId)
    .order("order_by", { ascending: true })
    .returns<StepRow[]>();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }

  if (!steps || steps.length === 0) {
    return NextResponse.json(
      { error: "Flavor has no steps to configure" },
      { status: 400 },
    );
  }

  const updates: Array<{ id: string | number; order_by: number; result: "ok" | string }> = [];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;

    let inputTypeId: number;
    let outputTypeId: number;
    let stepTypeId: number;

    if (isFirst && isLast) {
      inputTypeId = INPUT_TYPE_IMAGE;
      outputTypeId = OUTPUT_TYPE_JSON;
      stepTypeId = STEP_TYPE_IDENTIFY;
    } else if (isFirst) {
      inputTypeId = INPUT_TYPE_IMAGE;
      outputTypeId = OUTPUT_TYPE_TEXT;
      stepTypeId = STEP_TYPE_DESCRIBE;
    } else if (isLast) {
      inputTypeId = INPUT_TYPE_TEXT;
      outputTypeId = OUTPUT_TYPE_JSON;
      stepTypeId = STEP_TYPE_GENERATE;
    } else {
      inputTypeId = INPUT_TYPE_TEXT;
      outputTypeId = OUTPUT_TYPE_TEXT;
      stepTypeId = STEP_TYPE_DESCRIBE;
    }

    const currentUserPrompt = step.llm_user_prompt ?? "";
    const nextUserPrompt = isFirst
      ? currentUserPrompt
      : ensureChainReference(currentUserPrompt, step.order_by - 1);

    const nextSystemPrompt =
      step.llm_system_prompt && step.llm_system_prompt.trim().length > 0
        ? step.llm_system_prompt
        : isLast
          ? DEFAULT_FINAL_SYSTEM_PROMPT
          : DEFAULT_SYSTEM_PROMPT;

    const nextModelId =
      step.llm_model_id && step.llm_model_id > 0 ? step.llm_model_id : VISION_MODEL_ID;

    const { error: updateError } = await supabase
      .from(TABLES.flavorSteps)
      .update({
        humor_flavor_step_type_id: stepTypeId,
        llm_input_type_id: inputTypeId,
        llm_output_type_id: outputTypeId,
        llm_model_id: nextModelId,
        llm_system_prompt: nextSystemPrompt,
        llm_user_prompt: nextUserPrompt,
        modified_by_user_id: user.userId,
      })
      .eq("id", step.id);

    updates.push({
      id: step.id,
      order_by: step.order_by,
      result: updateError ? updateError.message : "ok",
    });
  }

  return NextResponse.json({
    flavorId,
    stepCount: steps.length,
    updates,
  });
}
