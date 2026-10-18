// The Dilreet chat agent: streams replies and can use tools (make pictures/videos, build features, check the PC).
const { getSettings } = require('./store');
const { chatOnce } = require('./ollama');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_image',
      description: 'Create a picture with the local image model. Use when the user asks you to draw, make, generate or design an image, photo, logo or artwork.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed English description of the picture' },
          style: { type: 'string', enum: ['none', 'photo', 'cinematic', 'anime', '3d', 'painting', 'logo', 'watercolor'] },
          shape: { type: 'string', enum: ['square', 'portrait', 'landscape'] }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_video',
      description: 'Create a short video clip with the local video model. Use only when the user asks for a video, clip or animation.',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string', description: 'Detailed English description of the scene and the motion' } },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_feature',
      description: 'Build a new add-on feature for Dilreet itself, or change Dilreet. Use when the user asks Dilreet to add, build or give itself a new feature, tool, tab or ability.',
      parameters: {
        type: 'object',
        properties: { request: { type: 'string', description: 'Clear description of the feature to build' } },
        required: ['request']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pc_info',
      description: "Get this computer's hardware (CPU, RAM, graphics card) and what it can run.",
      parameters: { type: 'object', properties: {} }
    }
  }
];

function systemPrompt(hw) {
  const s = getSettings();
  const who = s.userName ? `The user's name is ${s.userName}.` : '';
  const pc = hw ? `It runs on: ${hw.cpu.model}, ${Math.round(hw.ramGB)} GB RAM, GPU ${hw.gpu ? `${hw.gpu.name} (${hw.gpu.vramGB} GB)` : 'none'}.` : '';
  return `You are Dilreet, a warm, clear and helpful AI assistant running fully offline on the user's own Windows PC. ${who} ${pc}
Answer naturally and concisely. Use Markdown for structure when it helps (lists, tables, code blocks).
You have tools: create_image, create_video, add_feature and pc_info. Call a tool only when the user clearly wants that action. After a tool runs, say in one short sentence what is happening — do not invent results.`;
}

/**
 * Runs one user turn. `history` is the conversation so far (role/content).
 * `emit` sends UI events; `runTool(name, args)` performs an action and returns a short text result + optional attachment.
 */
async function respond({ history, model, hw, signal }, emit, runTool) {
  const s = getSettings();
  const useTools = s.agentTools !== false;
  const messages = [{ role: 'system', content: systemPrompt(hw) }, ...history.map((m) => ({ role: m.role, content: m.content }))];

  for (let round = 0; round < 3; round++) {
    const { content, toolCalls } = await chatOnce(
      { model, messages, tools: useTools ? TOOLS : null, think: s.showThinking, signal },
      (ev) => emit(ev)
    );
    if (!toolCalls.length) return { content };

    messages.push({ role: 'assistant', content, tool_calls: toolCalls });
    for (const call of toolCalls) {
      const name = call.function && call.function.name;
      let args = (call.function && call.function.arguments) || {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      emit({ type: 'tool', name, args });
      let result;
      try {
        result = await runTool(name, args);
      } catch (e) {
        result = { text: `Error: ${e.message}` };
      }
      if (result.attachment) emit({ type: 'attachment', attachment: result.attachment });
      messages.push({ role: 'tool', content: result.text, tool_name: name });
    }
    emit({ type: 'token', text: content ? '\n\n' : '' });
  }
  return {};
}

module.exports = { respond, TOOLS };
