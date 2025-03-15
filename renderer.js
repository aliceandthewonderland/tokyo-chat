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

// Ollama API configuration
const OLLAMA_API_BASE = 'http://localhost:11434/api';
let ollamaModels = [];
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
    // Show loading overlay with timer
    showLoadingOverlay(`Loading Model "${modelName}", it may take several minutes.`);
    
    // Start timer
    startLoadingTimer();
    
    // Set loading state
    isModelLoading = true;
    
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
    
    // Update status bar
    updateStatusBar();
    
    // Set loading state to false
    isModelLoading = false;
    
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
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    overlay.style.color = 'white';
    overlay.style.fontSize = '24px';
    overlay.style.textAlign = 'center';
    overlay.style.padding = '20px';
    overlay.style.flexDirection = 'column'; // Change to column for better layout
    
    document.body.appendChild(overlay);
  }
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.textContent = message;
  
  // Clear overlay and add message
  overlay.innerHTML = '';
  overlay.appendChild(messageElement);
  
  // Disable UI elements
  messageInput.disabled = true;
  sendButton.disabled = true;
}

// Function to hide loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  // Enable UI elements
  messageInput.disabled = false;
  sendButton.disabled = false;
}

// Process commands
function processCommand(command) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  
  switch (cmd) {
    case '/models':
      fetchOllamaModels().then(() => {
        displayAvailableModels();
      });
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
        loadModel(modelName);
      }
      return true;
    default:
      return false;
  }
}

// Send message function
function sendMessage() {
  const message = messageInput.value.trim();
  
  if (message) {
    // Add the message to the chat
    addMessage(message, true);
    
    // Clear the input
    messageInput.value = '';
    
    // Check if it's a command
    if (message.startsWith('/')) {
      if (!processCommand(message)) {
        addMessage(`Unknown command: ${message}. Try /models to see available models.`, false);
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

// Event Listeners
sendButton.addEventListener('click', sendMessage);

// Send message when Enter is pressed (without shift for new line)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Add a welcome message when the app starts
window.addEventListener('DOMContentLoaded', () => {
  addMessage('Welcome to Tokyo Chat!\n\n- Type your message and press Enter or the Send button to send\n- Markdown formatting is supported\n- Try using **bold**, *italic*, or `code`\n\nType `/models` to see available Ollama models. You can load models by number or name.', false);
  
  // Fetch available models on startup
  fetchOllamaModels().then(() => {
    // Don't display models automatically, wait for user command
    updateStatusBar();
  }).catch(error => {
    console.error('Error fetching models:', error);
  });
});

// Update status bar with model information
function updateStatusBar() {
  const statusBar = document.querySelector('.status-bar');
  
  // Keep existing spans
  const existingSpans = Array.from(statusBar.querySelectorAll('span'));
  
  // Add or update model status span
  let modelStatusSpan = statusBar.querySelector('.model-status');
  if (!modelStatusSpan) {
    modelStatusSpan = document.createElement('span');
    modelStatusSpan.classList.add('model-status');
    statusBar.appendChild(modelStatusSpan);
  }
  
  modelStatusSpan.textContent = currentModel ? `MODEL: ${currentModel}` : 'NO MODEL LOADED';
} 