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
  },
  {
    name: "colorize_objects",
    description: "Colorize one or more objects with a custom hex color (e.g. #ff0000, #38bdf8).",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Array of object IDs." },
        color: { type: "string", description: "Hex color string (e.g. #38bdf8)." }
      },
      required: ["objectIds", "color"]
    }
  },
  {
    name: "reset_object_colors",
    description: "Reset object colors back to default materials.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" }, description: "Optional array of object IDs. If omitted, resets all." }
      }
    }
  },
  {
    name: "set_camera_view",
    description: "Navigate camera to standard viewpoint preset.",
    parameters: {
      type: "object",
      properties: {
        view: { type: "string", enum: ["top", "bottom", "front", "back", "left", "right", "isometric"], description: "Preset view orientation." }
      },
      required: ["view"]
    }
  },
  {
    name: "set_camera_projection",
    description: "Switch 3D camera projection between perspective and orthographic.",
    parameters: {
      type: "object",
      properties: {
        projection: { type: "string", enum: ["perspective", "ortho"], description: "Projection mode." }
      },
      required: ["projection"]
    }
  },
  {
    name: "get_camera_state",
    description: "Get current eye, look, up camera position vectors.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "set_camera_state",
    description: "Move camera to specific coordinates.",
    parameters: {
      type: "object",
      properties: {
        eye: { type: "array", items: { type: "number" }, description: "[x, y, z] eye coordinates." },
        look: { type: "array", items: { type: "number" }, description: "[x, y, z] target coordinates." },
        up: { type: "array", items: { type: "number" }, description: "Optional [x, y, z] up vector." }
      },
      required: ["eye", "look"]
    }
  },
  {
    name: "set_viewer_theme",
    description: "Switch application theme between dark and light mode.",
    parameters: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["dark", "light"], description: "UI color theme." }
      },
      required: ["theme"]
    }
  },
  {
    name: "set_sun_position",
    description: "Control solar position lighting and simulation.",
    parameters: {
      type: "object",
      properties: {
        dateTime: { type: "string", description: "ISO date time string (e.g. 2026-10-11T12:00)." },
        skyColor: { type: "string", description: "Sky color hex." },
        groundColor: { type: "string", description: "Ground color hex." },
        enabled: { type: "boolean", description: "Whether solar simulation is enabled." }
      }
    }
  },
  {
    name: "get_loaded_models",
    description: "Get list of all loaded model files in the session.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_qto_summary",
    description: "Get Quantity Takeoff summary (volume, area, length, count) for all elements in model.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_element_qto",
    description: "Get Quantity Takeoff values for a specific element ID.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "Element ID." }
      },
      required: ["objectId"]
    }
  },
  {
    name: "get_boq_items",
    description: "Fetch all 5D Bill of Quantities items with unit pricing.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "calculate_project_cost",
    description: "Calculate total project estimated construction cost budget from BOQ database.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "search_ahsp_catalog",
    description: "Search Indonesian AHSP unit price analysis database by keyword.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text." }
      },
      required: ["query"]
    }
  },
  {
    name: "get_schedule_tasks",
    description: "Get all 4D construction schedule tasks and timeline information.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "create_schedule_task",
    description: "Create a new 4D construction schedule task linked to 3D elements.",
    parameters: {
      type: "object",
      properties: {
        workDesc: { type: "string", description: "Work description / task name." },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)." },
        endDate: { type: "string", description: "Ending date (YYYY-MM-DD)." },
        resourceId: { type: "string", description: "Optional labor resource ID." },
        resourceDesc: { type: "string", description: "Labor description." },
        resourceCount: { type: "number", description: "Number of laborers." },
        color: { type: "string", description: "Hex color for Gantt bar." },
        predecessor: { type: "string", description: "Predecessor task name." },
        progress: { type: "number", description: "Current progress (0-100)." },
        elementIds: { type: "array", items: { type: "string" }, description: "Linked 3D element IDs." }
      },
      required: ["workDesc", "startDate", "endDate"]
    }
  },
  {
    name: "update_schedule_task",
    description: "Update an existing schedule task (dates, progress, labor, elements).",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID of task to update." },
        progress: { type: "number", description: "New progress percentage (0-100)." },
        workDesc: { type: "string", description: "Updated description." },
        startDate: { type: "string", description: "Updated start date." },
        endDate: { type: "string", description: "Updated end date." }
      },
      required: ["taskId"]
    }
  },
  {
    name: "delete_schedule_task",
    description: "Delete a task from the 4D construction schedule.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID of task to delete." }
      },
      required: ["taskId"]
    }
  },
  {
    name: "set_schedule_today",
    description: "Set reference 'Today' date for progress monitoring and Gantt vertical line.",
    parameters: {
      type: "object",
      properties: {
        todayDate: { type: "string", description: "Date string (YYYY-MM-DD)." }
      },
      required: ["todayDate"]
    }
  },
  {
    name: "toggle_chronology_simulation",
    description: "Toggle 4D Chronology simulation mode on or off.",
    parameters: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Whether chronology simulation is on." }
      }
    }
  },
  {
    name: "set_chronology_simulation_date",
    description: "Scrub 4D chronology simulation to a specific calendar date.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date string (YYYY-MM-DD)." }
      },
      required: ["date"]
    }
  },
  {
    name: "save_schedule_draft",
    description: "Export current schedule draft as JSON containing element GlobalIDs.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "export_schedule_ods",
    description: "Export the 4D schedule to a LibreOffice Calc spreadsheet (.ods).",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "export_schedule_ifc",
    description: "Export the 4D schedule to Open Planner Studio IFC4X3 format.",
    parameters: {
      type: "object",
      properties: {}
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
      content: `You are BIM BAM AI Agent, an intelligent BIM engineering assistant integrated into this 3D BIM Viewer (xeokit).
You have full real-time access to all application capabilities:
1. Model & 3D Control: select, hide, isolate, highlight, xray, colorize elements, fly to elements, change camera viewpoints (top/bottom/front/back/left/right/isometric), projections, and UI themes.
2. Sectioning & Measurements: place section cut planes, measure distances, areas, and angles.
3. Solar Simulation: adjust sun date/time, sky/ground lighting, and shadows.
4. Quantity Takeoff & 5D BOQ Costing: retrieve element quantities, query BOQ pricing, search Indonesian AHSP price catalog, and calculate project budgets.
5. 4D Construction Scheduling & Simulation: view tasks, create/update/delete schedule tasks with assigned labor, set reference today date, scrub chronology 4D simulation, export to ODS / Open Planner Studio IFC, and save drafts with GlobalIDs.
6. BIM Auditing: execute model diffs and clash detections.

Always perform requested actions by calling the appropriate tool. Give concise, direct answers explaining what was done.`
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

  const executeTool = async (name, args = {}) => {
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
          return api.selectObjects(args.objectIds || args.ids);
        case 'hide_objects':
          return api.hideObjects(args.objectIds || args.ids);
        case 'show_all_objects':
          return api.showAllObjects();
        case 'isolate_objects':
          return api.isolateObjects(args.objectIds || args.ids);
        case 'highlight_objects':
          return api.highlightObjects(args.objectIds || args.ids, args.highlight);
        case 'xray_objects':
          return api.xrayObjects(args.objectIds || args.ids, args.xray);
        case 'colorize_objects':
          return api.colorizeObjects(args.objectIds || args.ids, args.color || args.hexColor);
        case 'reset_object_colors':
          return api.resetObjectColors(args.objectIds || args.ids);
        case 'fly_to_objects':
          return api.flyToObjects(args.objectIds || args.ids);
        case 'set_camera_view':
          return api.setCameraView(args.view);
        case 'set_camera_projection':
          return api.setCameraProjection(args.projection);
        case 'get_camera_state':
          return api.getCameraState();
        case 'set_camera_state':
          return api.setCameraState(args.eye, args.look, args.up);
        case 'set_viewer_theme':
          return api.setViewerTheme(args.theme);
        case 'set_sun_position':
          return api.setSunPosition(args.dateTime, args.skyColor, args.groundColor, args.enabled);
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
        case 'get_loaded_models':
          return api.getLoadedModels();
        case 'get_qto_summary':
          return api.getQtoSummary();
        case 'getElementQto':
        case 'get_element_qto':
          return api.getElementQto(args.objectId);
        case 'get_boq_items':
          return await api.getBoqItems();
        case 'calculate_project_cost':
          return await api.calculateProjectCost();
        case 'search_ahsp_catalog':
          return await api.searchAhspCatalog(args.query);
        case 'get_schedule_tasks':
          return api.getScheduleTasks();
        case 'create_schedule_task':
          return api.createScheduleTask(args);
        case 'update_schedule_task':
          return api.updateScheduleTask(args.taskId, args);
        case 'delete_schedule_task':
          return api.deleteScheduleTask(args.taskId);
        case 'set_schedule_today':
          return api.setScheduleToday(args.todayDate || args.date);
        case 'toggle_chronology_simulation':
          return api.toggleChronologySimulation(args.enabled);
        case 'set_chronology_simulation_date':
          return api.setChronologySimulationDate(args.date);
        case 'export_schedule_ods':
          return api.exportScheduleToOds();
        case 'export_schedule_ifc':
          return api.exportScheduleToOpenPlannerStudioIfc();
        case 'save_schedule_draft':
          return api.saveScheduleDraftJson();
        default:
          if (typeof api[name] === 'function') {
            return await api[name](args);
          }
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
