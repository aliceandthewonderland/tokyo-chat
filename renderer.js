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
  let modelList = '### Available Ollama Models\n\n';
  
  if (ollamaModels.length === 0) {
    modelList += 'No models found. Make sure Ollama is running on http://localhost:11434\n';
  } else {
    modelList += 'The following models are available:\n\n';
    ollamaModels.forEach(model => {
      modelList += `- **${model.name}** (${formatSize(model.size)})\n`;
    });
    
    modelList += '\nTo load a model, type: `/load modelname`\n';
    modelList += 'Current status: No model loaded';
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
      if (parts.length < 2) {
        addMessage('Please specify a model name to load. Type `/models` to see available models.', false);
      } else {
        const modelName = parts[1];
        addMessage(`Attempting to load model: ${modelName}. This feature is not yet implemented.`, false);
        // Here you would implement the model loading functionality
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
      addMessage(`You said: ${message}\n\nNo model is currently loaded. Use /models to see available models and /load to load one.`, false);
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
  addMessage('Welcome to Tokyo Chat!\n\n- Type your message and press Enter or the Send button to send\n- Markdown formatting is supported\n- Try using **bold**, *italic*, or `code`\n\nType `/models` to see available Ollama models.', false);
  
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