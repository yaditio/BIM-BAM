// --- AI Agent Tool Definitions & Controller for BIM BAM App ---

export const aiTools = [
  {
    name: "get_all_objects",
    description: "Get a list of all object IDs, types (classes), and names in the currently loaded models.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_object_metadata",
    description: "Get detailed IFC property sets and parameter values for a specific object ID.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "The unique ID of the object." }
      },
      required: ["objectId"]
    }
  },
  {
    name: "select_objects",
    description: "Select one or more objects by their IDs. Pass empty array to clear selection.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to select." }
      },
      required: ["objectIds"]
    }
  },
  {
    name: "hide_objects",
    description: "Hide one or more objects by their IDs.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to hide." }
      },
      required: ["objectIds"]
    }
  },
  {
    name: "show_all_objects",
    description: "Make all hidden objects visible again.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "isolate_objects",
    description: "Isolate one or more objects (makes them visible, and hides all other objects).",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to isolate." }
      },
      required: ["objectIds"]
    }
  },
  {
    name: "highlight_objects",
    description: "Highlight one or more objects by their IDs, or clear all highlights.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to highlight." },
        highlight: { type: "boolean", description: "Whether to highlight (true) or clear highlight (false)." }
      },
      required: ["objectIds", "highlight"]
    }
  },
  {
    name: "xray_objects",
    description: "Set X-Ray rendering mode for one or more objects.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to X-Ray." },
        xray: { type: "boolean", description: "Whether to enable X-Ray (true) or disable (false)." }
      },
      required: ["objectIds", "xray"]
    }
  },
  {
    name: "fly_to_objects",
    description: "Fly camera to fit the bounding box of specified object IDs (or fly to selection/model if empty).",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs to fly to." }
      }
    }
  },
  {
    name: "apply_property_filter",
    description: "Filter objects by property query criteria (e.g. search for all objects where property X equals Y).",
    parameters: {
      type: "object",
      properties: {
        propertyName: { type: "string", description: "Name of the property to check." },
        operator: { type: "string", enum: ["equals", "contains", "gt", "lt"], description: "Operator to apply." },
        propertyValue: { type: "string", description: "Value to compare against." }
      },
      required: ["propertyName", "operator", "propertyValue"]
    }
  },
  {
    name: "reset_property_filter",
    description: "Reset active property query filters.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "search_objects_by_text",
    description: "Search for objects matching a text string (searches name, type, id, properties) and highlights them.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text query to search." }
      },
      required: ["query"]
    }
  },
  {
    name: "add_section_plane",
    description: "Create a cutting section plane. You can specify a center cut or surface cut.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["center", "surface"], description: "Whether to place at center or interactive position." },
        pos: { type: "array", items: { type: "number" }, description: "Optional [x, y, z] position." },
        dir: { type: "array", items: { type: "number" }, description: "Optional [x, y, z] normal direction vector." }
      },
      required: ["type"]
    }
  },
  {
    name: "clear_section_planes",
    description: "Clear all section cutting planes.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "set_measurement_mode",
    description: "Activate one of the measurement tools (distance, angle, area, spot elevation, multiline) or pass 'none' to deactivate.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["distance", "angle", "area", "spotelev", "multiline", "none"], description: "Measurement mode." }
      },
      required: ["mode"]
    }
  },
  {
    name: "clear_all_measurements",
    description: "Clear all measurements drawn on the canvas.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "run_ifc_diff",
    description: "Compare two loaded models for differences (added, deleted, changed objects). Returns diff GUID list.",
    parameters: {
      type: "object",
      properties: {
        oldModelId: { type: "string", description: "ID of the old model." },
        newModelId: { type: "string", description: "ID of the new model." }
      },
      required: ["oldModelId", "newModelId"]
    }
  },
  {
    name: "run_clash_detection",
    description: "Detect geometric clashes within one model or between two models at a tolerance.",
    parameters: {
      type: "object",
      properties: {
        modelAId: { type: "string", description: "ID of Model A." },
        modelBId: { type: "string", description: "Optional ID of Model B." },
        tolerance: { type: "number", description: "Clash tolerance in meters (default 0.0)." }
      },
      required: ["modelAId"]
    }
  },
  {
    name: "update_object_parameter",
    description: "Update the value of a specific parameter/property for an object (works on both Revit parameters and IFC properties). Modifies in-memory representation.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "The unique ID of the object." },
        parameterName: { type: "string", description: "The name of the parameter/property to update." },
        newValue: { type: "string", description: "The new value to assign." }
      },
      required: ["objectId", "parameterName", "newValue"]
    }
  }
];

export function setupAiAgent() {
  const providerSelect = document.getElementById('aiProviderSelect');
  const geminiGroup = document.getElementById('geminiKeyGroup');
  const openaiGroup = document.getElementById('openaiKeyGroup');
  const anthropicGroup = document.getElementById('anthropicKeyGroup');
  const ollamaModelGroup = document.getElementById('ollamaModelGroup');
  
  const geminiInput = document.getElementById('geminiApiKey');
  const openaiInput = document.getElementById('openaiApiKey');
  const anthropicInput = document.getElementById('anthropicApiKey');
  const ollamaModelSelect = document.getElementById('ollamaModelSelect');
  
  const chatInput = document.getElementById('aiChatInput');
  const btnSend = document.getElementById('btnSendAiChat');
  const chatHistory = document.getElementById('aiChatHistory');
  const chatContainer = document.getElementById('aiAgentChatContainer');
  const chatHeader = document.getElementById('aiAgentChatHeader');
  const chatToggle = document.getElementById('aiAgentChatToggle');

  const loadOllamaModels = async () => {
    ollamaModelSelect.innerHTML = '<option value="">Loading models...</option>';
    try {
      const response = await fetch('/api/ollama/models');
      if (!response.ok) {
        throw new Error('Failed to load Ollama models');
      }
      const data = await response.json();
      ollamaModelSelect.innerHTML = '';
      if (!data.models || data.models.length === 0) {
        ollamaModelSelect.innerHTML = '<option value="">No models found</option>';
        return;
      }
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        ollamaModelSelect.appendChild(option);
      });
      if (localStorage.getItem('bim_ollama_model')) {
        ollamaModelSelect.value = localStorage.getItem('bim_ollama_model');
      }
    } catch (err) {
      console.error(err);
      ollamaModelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  };

  ollamaModelSelect.addEventListener('change', () => {
    localStorage.setItem('bim_ollama_model', ollamaModelSelect.value);
  });

  // Collapse/Expand toggle
  chatHeader.addEventListener('click', () => {
    const isCollapsed = chatContainer.classList.toggle('collapsed');
    if (isCollapsed) {
      chatToggle.className = 'fa-solid fa-chevron-up toggle-icon';
    } else {
      chatToggle.className = 'fa-solid fa-chevron-down toggle-icon';
    }
  });

  // Toggle API key fields
  providerSelect.addEventListener('change', () => {
    const val = providerSelect.value;
    geminiGroup.style.display = val === 'gemini' ? 'block' : 'none';
    openaiGroup.style.display = val === 'openai' ? 'block' : 'none';
    anthropicGroup.style.display = val === 'anthropic' ? 'block' : 'none';
    ollamaModelGroup.style.display = val === 'ollama' ? 'block' : 'none';
    if (val === 'ollama') {
      loadOllamaModels();
    }
  });

  // Load saved API keys from localStorage
  if (localStorage.getItem('bim_gemini_key')) geminiInput.value = localStorage.getItem('bim_gemini_key');
  if (localStorage.getItem('bim_openai_key')) openaiInput.value = localStorage.getItem('bim_openai_key');
  if (localStorage.getItem('bim_anthropic_key')) anthropicInput.value = localStorage.getItem('bim_anthropic_key');

  if (providerSelect.value === 'ollama') {
    ollamaModelGroup.style.display = 'block';
    loadOllamaModels();
  }

  const getApiKey = () => {
    const provider = providerSelect.value;
    if (provider === 'gemini') return geminiInput.value.trim();
    if (provider === 'openai') return openaiInput.value.trim();
    if (provider === 'anthropic') return anthropicInput.value.trim();
    return '';
  };

  const saveApiKeys = () => {
    localStorage.setItem('bim_gemini_key', geminiInput.value.trim());
    localStorage.setItem('bim_openai_key', openaiInput.value.trim());
    localStorage.setItem('bim_anthropic_key', anthropicInput.value.trim());
  };

  let messages = [
    {
      role: 'system',
      content: `You are BIM BAM AI Agent, a helpful assistant integrated into a 3D BIM Viewer (xeokit). 
You have access to tools to query model structure, zoom/fly to objects, control visibility, and run clash detection.
Always perform the actions requested by calling the appropriate tool. If the user asks you to select, hide, show, diff, or measure, call the corresponding tool first.
CRITICAL: To avoid rate-limits and token exhaustion, avoid calling 'get_all_objects' unless absolutely necessary. Instead, prefer targeted queries using 'search_objects_by_text' or 'apply_property_filter'.
After calling a tool, explain what you did clearly in one or two short sentences.`
    }
  ];

  const appendMessage = (role, content, extraClass = '') => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${role} ${extraClass}`;
    msgDiv.textContent = content;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msgDiv;
  };

  const removeMessage = (el) => {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  };

  const executeTool = async (name, args) => {
    const api = window.bimBamApi;
    if (!api) {
      return { error: "BIM BAM Control API not found." };
    }

    try {
      console.log(`[AI Agent] Running tool: ${name} with args:`, args);
      
      switch (name) {
        case 'get_all_objects':
          return api.getAllObjects();
        case 'get_object_metadata':
          return api.getObjectMetadata(args.objectId);
        case 'select_objects':
          return api.selectObjects(args.objectIds);
        case 'hide_objects':
          return api.hideObjects(args.objectIds);
        case 'show_all_objects':
          return api.showAllObjects();
        case 'isolate_objects':
          return api.isolateObjects(args.objectIds);
        case 'highlight_objects':
          return api.highlightObjects(args.objectIds, args.highlight);
        case 'xray_objects':
          return api.xrayObjects(args.objectIds, args.xray);
        case 'fly_to_objects':
          return api.flyToObjects(args.objectIds);
        case 'apply_property_filter':
          return api.applyPropertyFilter(args.propertyName, args.operator, args.propertyValue);
        case 'reset_property_filter':
          return api.resetPropertyFilter();
        case 'search_objects_by_text':
          return api.searchObjectsByText(args.query);
        case 'add_section_plane':
          return api.addSectionPlane(args.type, args.pos, args.dir);
        case 'clear_section_planes':
          return api.clearSectionPlanes();
        case 'set_measurement_mode':
          return api.setMeasurementMode(args.mode);
        case 'clear_all_measurements':
          return api.clearAllMeasurements();
        case 'run_ifc_diff':
          return await api.runIfcDiff(args.oldModelId, args.newModelId);
        case 'run_clash_detection':
          return await api.runClashDetection(args.modelAId, args.modelBId, args.tolerance);
        case 'update_object_parameter':
          return api.updateObjectParameter(args.objectId, args.parameterName, args.newValue);
        default:
          return { error: `Tool ${name} is not implemented.` };
      }
    } catch (err) {
      console.error(`[AI Agent] Tool execution error for ${name}:`, err);
      return { error: err.message || `Failed to execute tool ${name}` };
    }
  };

  const handleSendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text) return;

    const provider = providerSelect.value;
    const apiKey = getApiKey();
    if (!apiKey && provider !== 'ollama') {
      appendMessage('error', 'Please enter your API Key.');
      return;
    }
    if (provider === 'ollama' && !ollamaModelSelect.value) {
      appendMessage('error', 'Please select an Ollama model.');
      return;
    }
    saveApiKeys();

    chatInput.value = '';
    appendMessage('user', text);
    messages.push({ role: 'user', content: text });

    await runChatLoop(apiKey);
  };

  const runChatLoop = async (apiKey) => {
    const provider = providerSelect.value;
    
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'ai-message thinking';
    thinkingEl.innerHTML = `Thinking <div class="ai-dot-loader"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
    chatHistory.appendChild(thinkingEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey,
          messages,
          tools: aiTools,
          model: provider === 'ollama' ? ollamaModelSelect.value : undefined
        })
      });

      removeMessage(thinkingEl);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server error during generation');
      }

      const resData = await response.json();
      
      if (resData.tool_calls && resData.tool_calls.length > 0) {
        // Render introductory explanation text if present
        if (resData.content && resData.content.trim() !== "") {
          appendMessage('agent', resData.content);
        }

        const toolResponses = [];
        for (const toolCall of resData.tool_calls) {
          const toolNotice = document.createElement('div');
          toolNotice.className = 'ai-tool-call';
          toolNotice.textContent = `⚡ Calling: ${toolCall.function.name}(${toolCall.function.arguments})`;
          chatHistory.appendChild(toolNotice);
          chatHistory.scrollTop = chatHistory.scrollHeight;

          try {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeTool(toolCall.function.name, args);
            toolResponses.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify(result)
            });
          } catch (err) {
            toolResponses.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify({ error: err.message })
            });
          }
        }

        messages.push({
          role: 'assistant',
          content: resData.content || null,
          tool_calls: resData.tool_calls
        });
        messages.push(...toolResponses);

        await runChatLoop(apiKey);
      } else {
        const agentText = resData.content || "Done.";
        appendMessage('agent', agentText);
        messages.push({ role: 'assistant', content: agentText });
      }

    } catch (err) {
      removeMessage(thinkingEl);
      appendMessage('error', 'Error: ' + err.message);
      console.error(err);
    }
  };

  btnSend.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  });
}
