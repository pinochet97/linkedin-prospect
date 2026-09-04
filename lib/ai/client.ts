import OpenAI from 'openai';
import { getConfig, isAiMocked } from '@/lib/config';
import type { Prompt } from './prompts';

/**
 * Camada fina sobre a OpenAI. Quando não há chave (ou AI_MODE=mock), o sistema
 * continua funcionando com geradores determinísticos — dá para desenvolver e
 * testar o motor inteiro sem gastar token.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const config = getConfig();
    if (!config.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.');
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return client;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export async function completeJson<T>(prompt: Prompt, schema: JsonSchemaSpec): Promise<T> {
  const response = await getClient().chat.completions.create({
    model: getConfig().OPENAI_MODEL,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    },
    temperature: 0.2,
    max_completion_tokens: 400,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu vazio.');
  return JSON.parse(content) as T;
}

export async function completeText(prompt: Prompt, maxTokens = 320): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: getConfig().OPENAI_MODEL,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.7,
    max_completion_tokens: maxTokens,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error('A OpenAI respondeu vazio.');
  return content;
}

export { isAiMocked };
