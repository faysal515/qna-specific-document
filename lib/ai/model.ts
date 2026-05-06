import { azure } from "@ai-sdk/azure";

export function getChatModel() {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (!deployment) {
    throw new Error(
      "Missing AZURE_OPENAI_DEPLOYMENT env var (Azure OpenAI deployment name).",
    );
  }

  return azure(deployment);
}

