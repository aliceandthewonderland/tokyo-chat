// Import marked for Markdown parsing
const { marked } = require('marked');
const fetch = require('node-fetch');

// Set default options for marked
marked.setOptions({
  breaks: true,       // Convert new lines to <br>
  gfm: true,          // Enable GitHub Flavored Markdown
  headerIds: false,   // Don't add IDs to headers
  mangle: false,      // Don't mangle email links
  sanitize: false,    // Don't sanitize HTML (handled separately)
});

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const modelDropdown = document.getElementById('model-dropdown');
const modelLoadingIndicator = document.getElementById('model-loading-indicator');

// Ollama API configuration
const OLLAMA_API_BASE = 'http://localhost:11434/api';
let ollamaModels = [];
let loadedModels = [];
let currentModel = null;
let isModelLoading = false;

// Variables for the loading timer
let loadingTimerInterval = null;
let loadingStartTime = null;
let loadingTimerElement = null;

// Function to add a message to the chat
function addMessage(content, isUser = true) {
  // Create message elements
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  
  // Add timestamp
  const timestamp = document.createElement('span');
  timestamp.classList.add('message-timestamp');
  const now = new Date();
  timestamp.textContent = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
  
  // Add sender
  const sender = document.createElement('span');
  sender.classList.add('message-sender');
  sender.textContent = isUser ? 'USER>' : 'SYSTEM>';
  sender.style.color = isUser ? '#00AAFF' : '#FF5555';
  
  // Add content with markdown parsing
  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  
  // Convert markdown to HTML and add to the message content
  messageContent.innerHTML = marked.parse(escapeHtml(content));
  
  // Append elements
  messageElement.appendChild(timestamp);
  messageElement.appendChild(sender);
  messageElement.appendChild(document.createTextNode(' '));
  messageElement.appendChild(messageContent);
  
  // Add to chat
  chatMessages.appendChild(messageElement);
  
  // Scroll to the bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Function to fetch available models from Ollama API
async function fetchOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/tags`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    ollamaModels = data.models || [];
    return ollamaModels;
  } catch (error) {
    console.error('Error fetching Ollama models:', error);
    return [];
  }
}

// Function to fetch loaded models from Ollama API
async function fetchLoadedModels() {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/ps`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    loadedModels = data.models || [];
    return loadedModels;
  } catch (error) {
    console.error('Error fetching loaded Ollama models:', error);
    return [];
  }
}

// Function to display available models
function displayAvailableModels() {
  let modelList = '### Available LLM Models\n\n';
  
  if (ollamaModels.length === 0) {
    modelList += 'No models found. Make sure Ollama is running on http://localhost:11434\n';
  } else {
    modelList += 'The following models are available:\n\n';
    ollamaModels.forEach((model, index) => {
      // modelList += `${index + 1}. **${model.name}** (${formatSize(model.size)})\n`;
      modelList += `**${index + 1}**. ${model.name} (${formatSize(model.size)})\n`;
    });
    
    modelList += '\nTo load a model, type: `/load [number]` or `/load [model_name]`\n';
    modelList += `Current status: ${currentModel ? `Model "${currentModel}" loaded` : 'No model loaded'}`;
  }
  
  addMessage(modelList, false);
}

// Helper function to format file size
function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Function to load a model using Ollama API
async function loadModel(modelName) {
  try {
    // Set loading state
    isModelLoading = true;
    
    // Update UI to show loading state
    await updateStatusBar();
    
    // Show loading overlay with timer
    showLoadingOverlay(`Loading Model "${modelName}", it may take several minutes.`);
    
    // Start timer
    startLoadingTimer();
    
    // Make API request to load the model
    const response = await fetch(`${OLLAMA_API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        prompt: "" // Empty prompt to just load the model
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Stop timer
    stopLoadingTimer();
    
    // Update current model
    currentModel = modelName;
    
    // Hide loading overlay
    hideLoadingOverlay();
    
    // Set loading state to false
    isModelLoading = false;
    
    // Refresh the loaded models list
    await updateStatusBar();
    
    // Notify user
    addMessage(`Model "${modelName}" has been successfully loaded and is ready to use.`, false);
    
    return true;
  } catch (error) {
    // Stop timer
    stopLoadingTimer();
    
    // Hide loading overlay
    hideLoadingOverlay();
    
    // Set loading state to false
    isModelLoading = false;
    
    // Refresh the loaded models list
    await updateStatusBar();
    
    // Notify user of error
    addMessage(`Error loading model "${modelName}": ${error.message}`, false);
    console.error('Error loading model:', error);
    
    return false;
  }
}

// Function to start the loading timer
function startLoadingTimer() {
  // Reset timer variables
  loadingStartTime = new Date();
  
  // Create timer element if it doesn't exist
  if (!loadingTimerElement) {
    loadingTimerElement = document.createElement('div');
    loadingTimerElement.style.marginTop = '20px';
    loadingTimerElement.style.fontSize = '18px';
    
    // Add timer element to the overlay
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.appendChild(loadingTimerElement);
    }
  }
  
  // Update timer immediately
  updateLoadingTimer();
  
  // Set interval to update timer every second
  loadingTimerInterval = setInterval(updateLoadingTimer, 1000);
}

// Function to update the loading timer display
function updateLoadingTimer() {
  if (!loadingStartTime || !loadingTimerElement) return;
  
  // Calculate elapsed time
  const now = new Date();
  const elapsedMs = now - loadingStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  
  // Format time string
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Update timer display
  loadingTimerElement.textContent = `Time elapsed: ${timeString}`;
}

// Function to stop the loading timer
function stopLoadingTimer() {
  if (loadingTimerInterval) {
    clearInterval(loadingTimerInterval);
    loadingTimerInterval = null;
  }
  
  loadingStartTime = null;
  loadingTimerElement = null;
}

// Function to show loading overlay
function showLoadingOverlay(message) {
  // Update loading indicator in status bar
  const loadingIndicator = document.getElementById('model-loading-indicator');
  loadingIndicator.classList.remove('hidden');
  
  // Create overlay if it doesn't exist
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    overlay.style.color = '#00FF00';
    overlay.style.fontFamily = "'DOS', monospace";
    overlay.style.textAlign = 'center';
    
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.fontSize = '24px';
    messageElement.style.marginBottom = '20px';
    
    const loadingAnimation = document.createElement('div');
    loadingAnimation.textContent = 'LOADING...';
    loadingAnimation.style.fontSize = '36px';
    loadingAnimation.style.animation = 'blink 1s step-end infinite';
    
    overlay.appendChild(messageElement);
    overlay.appendChild(loadingAnimation);
    
    document.body.appendChild(overlay);
  }
  
  // Disable UI elements
  messageInput.disabled = true;
  sendButton.disabled = true;
}

// Function to hide loading overlay
function hideLoadingOverlay() {
  // Update loading indicator in status bar
  const loadingIndicator = document.getElementById('model-loading-indicator');
  loadingIndicator.classList.add('hidden');
  
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  // Enable UI elements
  messageInput.disabled = false;
  sendButton.disabled = false;
}

// Process commands
async function processCommand(command) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  
  switch (cmd) {
    case '/models':
      await fetchOllamaModels();
      displayAvailableModels();
      return true;
    case '/load':
      if (isModelLoading) {
        addMessage('A model is currently being loaded. Please wait for it to complete.', false);
        return true;
      }
      
      if (parts.length < 2) {
        addMessage('Please specify a model number or name to load. Type `/models` to see available models.', false);
      } else {
        const modelIdentifier = parts[1];
        let modelName;
        
        // Check if the input is a number
        const modelIndex = parseInt(modelIdentifier) - 1;
        if (!isNaN(modelIndex) && modelIndex >= 0 && modelIndex < ollamaModels.length) {
          // User provided a number
          modelName = ollamaModels[modelIndex].name;
        } else {
          // User provided a name
          modelName = modelIdentifier;
          
          // Verify the model exists
          const modelExists = ollamaModels.some(model => model.name === modelName);
          if (!modelExists && ollamaModels.length > 0) {
            addMessage(`Model "${modelName}" not found. Type \`/models\` to see available models.`, false);
            return true;
          }
        }
        
        addMessage(`Attempting to load model: ${modelName}...`, false);
        // Load the model
        await loadModel(modelName);
      }
      return true;
    case '/loaded':
      // Fetch and display loaded models
      await fetchLoadedModels();
      let loadedModelsList = '### Currently Loaded Models\n\n';
      
      if (loadedModels.length === 0) {
        loadedModelsList += 'No models are currently loaded.';
      } else {
        loadedModelsList += 'The following models are currently loaded and ready to use:\n\n';
        loadedModels.forEach((model, index) => {
          loadedModelsList += `**${index + 1}**. ${model.name}\n`;
        });
        
        loadedModelsList += '\nYou can switch between loaded models using the dropdown in the status bar.';
      }
      
      addMessage(loadedModelsList, false);
      return true;
    case '/help':
      const helpMessage = `### Available Commands
      
**/models** - Show all available models
**/loaded** - Show currently loaded models
**/load [name]** - Load a model by name or number
**/help** - Show this help message

You can also switch between loaded models using the dropdown in the status bar.`;
      addMessage(helpMessage, false);
      return true;
    default:
      return false;
  }
}

// Send message function
async function sendMessage() {
  const message = messageInput.value.trim();
  
  if (message) {
    // Add the message to the chat
    addMessage(message, true);
    
    // Clear the input
    messageInput.value = '';
    
    // Check if it's a command
    if (message.startsWith('/')) {
      try {
        const isCommand = await processCommand(message);
        if (!isCommand) {
          addMessage(`Unknown command: ${message}. Type /help to see available commands.`, false);
        }
      } catch (error) {
        console.error('Error processing command:', error);
        addMessage(`Error processing command: ${error.message}`, false);
      }
      return;
    }
    
    // Here you would typically send the message to a server or another user
    // For this demo, we'll just echo back a response
    setTimeout(() => {
      if (currentModel) {
        addMessage(`You said: ${message}\n\nModel "${currentModel}" is loaded, but message processing is not yet implemented.`, false);
      } else {
        addMessage(`You said: ${message}\n\nNo model is currently loaded. Use /models to see available models and /load to load one.`, false);
      }
    }, 1000);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize the application
  init();
  
  // Add event listener for message input (Enter key)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage().catch(error => {
        console.error('Error sending message:', error);
      });
    }
  });
  
  // Add event listener for send button
  sendButton.addEventListener('click', () => {
    sendMessage().catch(error => {
      console.error('Error sending message:', error);
    });
  });
  
  // Welcome message
  addMessage('Welcome to Tokyo Chat v1.0.0! Type `/help` to see available commands.', false);
});

// Update status bar with model information
async function updateStatusBar() {
  // Get the dropdown element
  const dropdown = document.getElementById('model-dropdown');
  
  // Clear all existing options
  dropdown.innerHTML = '';
  
  // Add default "NO MODEL LOADED" option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'NO MODEL LOADED';
  dropdown.appendChild(defaultOption);
  
  try {
    // Fetch loaded models
    await fetchLoadedModels();
    
    // Add loaded models to dropdown
    if (loadedModels.length > 0) {
      loadedModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.name;
        dropdown.appendChild(option);
      });
      
      // Set the current model as selected if it exists
      if (currentModel) {
        // Check if current model is in the loaded models
        const isCurrentModelLoaded = loadedModels.some(model => model.name === currentModel);
        
        if (isCurrentModelLoaded) {
          dropdown.value = currentModel;
        } else {
          // If current model is no longer loaded, reset it
          currentModel = null;
          dropdown.value = '';
        }
      }
    }
  } catch (error) {
    console.error('Error updating status bar:', error);
  }
  
  // Update loading indicator
  const loadingIndicator = document.getElementById('model-loading-indicator');
  if (isModelLoading) {
    loadingIndicator.classList.remove('hidden');
  } else {
    loadingIndicator.classList.add('hidden');
  }
}

// Initialize the application
async function init() {
  try {
    // Fetch available models (for commands like /models)
    await fetchOllamaModels();
    
    // Update status bar with loaded models
    await updateStatusBar();
    
    // Add event listener for model dropdown
    const dropdown = document.getElementById('model-dropdown');
    dropdown.addEventListener('change', async (e) => {
      const selectedModel = e.target.value;
      
      // If no model is selected, do nothing
      if (!selectedModel) {
        // Reset current model
        currentModel = null;
        await updateStatusBar();
        return;
      }
      
      // If the selected model is already loaded, do nothing
      if (selectedModel === currentModel) return;
      
      // Set the current model
      currentModel = selectedModel;
      await updateStatusBar();
      
      // Notify user
      addMessage(`Switched to model: ${selectedModel}`, false);
    });
    
    // Set up a timer to periodically refresh the loaded models list
    setInterval(async () => {
      await updateStatusBar();
    }, 10000); // Refresh every 10 seconds
  } catch (error) {
    console.error('Error initializing application:', error);
    addMessage('Error initializing application. Please make sure Ollama is running on http://localhost:11434', false);
  }
} 