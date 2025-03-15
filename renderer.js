// Import marked for Markdown parsing
const { marked } = require('marked');
const fetch = require('node-fetch');
const { streamText } = require('ai');
const { ollama } = require('ollama-ai-provider');

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

// Debug mode - set to true to enable debugging output
const DEBUG_MODE = false;

// Ollama API configuration
const OLLAMA_API_BASE = 'http://localhost:11434/api';
let ollamaModels = [];
let loadedModels = [];
let currentModel = null;
let isModelLoading = false;

// Chat message history
let messageHistory = [];

// Variables for the loading timer
let loadingTimerInterval = null;
let loadingStartTime = null;
let loadingTimerElement = null;

// Global AbortController reference
let activeGenerationController = null;

// Function to add a message to the chat
function addMessage(content, isUser = true, addToHistory = true) {
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
  sender.textContent = isUser ? 'USER>' : 'ASSISTANT>';
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

  // Add to message history if needed
  if (addToHistory) {
    messageHistory.push({
      role: isUser ? 'user' : 'assistant',
      content: content
    });
  }

  // // Force scroll to bottom with multiple approaches to ensure it works
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
  let modelList = '### Your available local LLM Models\n\n';
  
  if (ollamaModels.length === 0) {
    modelList += 'No models found. Make sure Ollama is running on http://localhost:11434\n';
  } else {
    ollamaModels.forEach((model, index) => {
      // modelList += `${index + 1}. **${model.name}** (${formatSize(model.size)})\n`;
      modelList += `**${index + 1}**. ${model.name} (${formatSize(model.size)})\n`;
    });
    
    modelList += '\nTo load a model, type: `/load [number]` or `/load [model_name]`\n';
    modelList += `Current status: ${currentModel ? `Model "${currentModel}" loaded` : 'No model loaded'}`;
  }
  
  addMessage(modelList, false, false);
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
    showLoadingOverlay(`Loading Model "${modelName}", it may take several minutes depends on the model size and your system performance.`);
    
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
    addMessage(`Model "${modelName}" has been successfully loaded and is ready to use.`, false, false);
    
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
    addMessage(`Error loading model "${modelName}": ${error.message}`, false, false);
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
  
  // Note: We no longer disable UI elements here
  // This is now handled by the setGeneratingState function
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
  
  // Note: We no longer enable UI elements here
  // This is now handled by the setGeneratingState function
  // to prevent conflicts with the generating state
}

// Function to clear chat messages from the UI
function clearChat() {
  // Clear the chat messages from the UI
  chatMessages.innerHTML = '';
  // Note: We don't clear messageHistory as per requirements
  addMessage('Chat cleared. Message history is preserved for context.', false, false);
}

// Function to update UI for generation state
function setGeneratingState(isGenerating) {
  // Get UI elements
  const sendButton = document.getElementById('send-button');
  const stopButton = document.getElementById('stop-button');
  const messageInput = document.getElementById('message-input');
  
  if (isGenerating) {
    // Hide send button, show stop button
    if (sendButton) sendButton.style.display = 'none';
    if (stopButton) stopButton.style.display = 'inline-block';
    
    // Disable text input
    if (messageInput) messageInput.disabled = true;
  } else {
    // Show send button, hide stop button
    if (sendButton) sendButton.style.display = 'inline-block';
    if (stopButton) stopButton.style.display = 'none';
    
    // Enable text input
    if (messageInput) messageInput.disabled = false;
    // Focus the input field when returning to non-generating state
    messageInput.focus();
    
    // Reset the abort controller
    activeGenerationController = null;
  }
}

// Function to stop ongoing generation
function stopGeneration() {
  if (activeGenerationController) {
    activeGenerationController.abort();
    console.log('Generation stopped by user');
    
    // Make sure to hide loading overlay when stopping generation
    hideLoadingOverlay();
    stopLoadingTimer();
    
    // Return to non-generating state immediately when stopped
    setGeneratingState(false);
  }
}

// Function to send a chat completion request to Ollama API
async function sendChatCompletion(messages, model) {
  try {
    // Create AbortController for this generation
    activeGenerationController = new AbortController();
    const signal = activeGenerationController.signal;
    
    // Set UI to generating state
    setGeneratingState(true);
    
    // Create a placeholder for the response
    const responseId = Date.now();
    const placeholderId = `response-${responseId}`;
    
    // Add an empty message that we'll update as we receive chunks
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.id = placeholderId;
    
    // Add timestamp
    const timestamp = document.createElement('span');
    timestamp.classList.add('message-timestamp');
    const now = new Date();
    timestamp.textContent = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    
    // Add sender
    const sender = document.createElement('span');
    sender.classList.add('message-sender');
    sender.textContent = 'ASSISTANT>';
    sender.style.color = '#FF5555';
    
    // Add content with markdown parsing
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.innerHTML = '<div class="typing-indicator">▋</div>';
    
    // Append elements
    messageElement.appendChild(timestamp);
    messageElement.appendChild(sender);
    messageElement.appendChild(document.createTextNode(' '));
    messageElement.appendChild(messageContent);
    
    // Add to chat
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Initialize the full response variable
    let fullResponse = '';
    
    // Filter messages to only include user and assistant messages
    const filteredMessages = messages.filter(msg => 
      msg.role === 'user' || msg.role === 'assistant'
    );
    
    // Show loading overlay
    showLoadingOverlay('Generating response... it may take several minutes depends on the model size and your system performance.');
    
    // Start timer
    startLoadingTimer();
    
    try {
      if (DEBUG_MODE) console.log("Sending chat request to Ollama API:", model, filteredMessages);
      
      // Get reference to the content element for updating
      const contentElement = document.querySelector(`#${placeholderId} .message-content`);
      
      if (contentElement) {
        // Start with empty content
        contentElement.innerHTML = '';
      }
      
      // Create the Ollama model with the baseURL and pass the abort signal
      const ollamaModel = ollama(model, { 
        baseUrl: OLLAMA_API_BASE,
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            signal: signal // Pass the abort signal to the fetch request
          });
        }
      });
      
      // Process the stream and update the UI in real-time
      const { textStream } = await streamText({
        model: ollamaModel,
        messages: filteredMessages,
        signal: signal // Add abort signal
      });
      
      // Flag to track if we've received the first chunk
      let isFirstChunk = true;
      
      // Process the text stream
      try {
        for await (const chunk of textStream) {
          // Check if generation was aborted
          if (signal.aborted) {
            throw new DOMException('Generation aborted by user', 'AbortError');
          }
          
          // If this is the first chunk, hide the loading overlay
          if (isFirstChunk && chunk.trim() !== '') {
            hideLoadingOverlay();
            stopLoadingTimer();
            isFirstChunk = false;
          }
          
          // Append chunk to fullResponse
          fullResponse += chunk;
          
          // Update UI with the current content
          if (contentElement) {
            contentElement.innerHTML = marked.parse(escapeHtml(fullResponse));
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        }
      } catch (error) {
        // Handle abort errors
        if (error.name === 'AbortError') {
          console.log('Generation was aborted');
          
          // Add a note to the response indicating it was stopped
          fullResponse += '\n\n**[Generation stopped by user]**';
          
          // Update UI with the aborted message
          if (contentElement) {
            contentElement.innerHTML = marked.parse(escapeHtml(fullResponse));
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          
          // Make sure the loading overlay is hidden
          hideLoadingOverlay();
          stopLoadingTimer();
          
          // Reset UI to non-generating state
          setGeneratingState(false);
          
          // Add the partial response to message history
          messageHistory.push({
            role: 'assistant',
            content: fullResponse
          });
          
          // Return the partial response
          return fullResponse;
        } else {
          throw error;
        }
      }
      
      // Make sure the loading overlay is hidden in case no chunks were received
      if (isFirstChunk) {
        hideLoadingOverlay();
        stopLoadingTimer();
      }
      
      // Add the full response to message history
      messageHistory.push({
        role: 'assistant',
        content: fullResponse
      });
      
      // Reset UI to non-generating state
      setGeneratingState(false);
      
      // Auto-focus the input field after response is complete
      messageInput.focus();
      
      return fullResponse;
    } catch (error) {
      // Hide loading overlay
      hideLoadingOverlay();
      
      // Stop timer
      stopLoadingTimer();
      
      // Reset UI to non-generating state
      setGeneratingState(false);
      
      console.error('Error in chat completion:', error);
      // Update the message to show the error
      const contentElement = document.querySelector(`#${placeholderId} .message-content`);
      if (contentElement) {
        contentElement.innerHTML = marked.parse(escapeHtml(`Error: ${error.message}`));
      }
      return null;
    }
  } catch (error) {
    // Hide loading overlay in case of outer error
    hideLoadingOverlay();
    
    // Stop timer
    stopLoadingTimer();
    
    // Reset UI to non-generating state
    setGeneratingState(false);
    
    console.error('Error setting up chat completion:', error);
    addMessage(`Error generating response: ${error.message}`, false, false);
    return null;
  }
}

async function processCommand(command) {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  
  switch (cmd) {
    case '/clear':
      clearChat();
      return true;
    case '/history':
      // Display the current message history
      displayChatHistory();
      return true;
    case '/reset':
      // Clear both UI and message history
      resetChat();
      return true;
    case '/models':
      await fetchOllamaModels();
      displayAvailableModels();
      return true;
    case '/load':
      if (isModelLoading) {
        addMessage('A model is currently being loaded. Please wait for it to complete.', false, false);
        return true;
      }
      
      if (parts.length < 2) {
        addMessage('Please specify a model number or name to load. Type `/models` to see available models.', false, false);
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
            addMessage(`Model "${modelName}" not found. Type \`/models\` to see available models.`, false, false);
            return true;
          }
        }
        
        addMessage(`Attempting to load model: ${modelName}...`, false, false);
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
      
      addMessage(loadedModelsList, false, false);
      return true;
    case '/help':
      const helpMessage = `### Available Commands
      
**/models** - Show all available models
**/loaded** - Show currently loaded models
**/load [name]** - Load a model by name or number
**/clear** - Clear the chat (UI only, message history is preserved)
**/reset** - Clear both the chat UI and message history
**/history** - Display the current message history
**/help** - Show this help message

You can also switch between loaded models using the dropdown in the status bar.`;
      addMessage(helpMessage, false, false);
      return true;
    default:
      return false;
  }
}

// Function to display the current chat history
function displayChatHistory() {
  const historyCount = messageHistory.length;
  let historyMessage = `### Current Chat History (${historyCount} messages)\n\n`;
  
  if (historyCount === 0) {
    historyMessage += 'No messages in history.';
  } else {
    historyMessage += 'The following messages are stored in memory:\n\n';
    
    messageHistory.forEach((msg, index) => {
      const role = msg.role.toUpperCase();
      const preview = msg.content.length > 50 
        ? msg.content.substring(0, 50) + '...' 
        : msg.content;
      
      historyMessage += `**${index + 1}.** **${role}**: ${preview}\n\n`;
    });
  }
  
  addMessage(historyMessage, false, false);
}

// Function to reset the chat (clear both UI and history)
function resetChat() {
  // Clear the chat messages from the UI
  chatMessages.innerHTML = '';
  
  // Clear the message history
  messageHistory = [];
  
  // Add a notification message
  addMessage('Chat reset. Both UI and message history have been cleared.', false, false);
}

// Send message function
async function sendMessage() {
  const message = messageInput.value.trim();
  
  if (message) {
    // Check if it's a command
    if (message.startsWith('/')) {
      // Add the command to the chat UI only, not to history
      addMessage(message, true, false);
      
      // Clear the input
      messageInput.value = '';
      
      try {
        const isCommand = await processCommand(message);
        if (!isCommand) {
          addMessage(`Unknown command: ${message}. Type /help to see available commands.`, false, false);
        }
      } catch (error) {
        console.error('Error processing command:', error);
        addMessage(`Error processing command: ${error.message}`, false, false);
      }
      return;
    }
    
    // If not a command, add the message to the chat and history
    addMessage(message, true, true);
    
    // Clear the input
    messageInput.value = '';
    
    // Check if a model is loaded
    if (!currentModel) {
      addMessage('No model is currently loaded. Use /models to see available models and /load to load one.', false, false);
      return;
    }
    
    // Send the message to the Ollama API
    try {
      await sendChatCompletion(messageHistory, currentModel);
    } catch (error) {
      console.error('Error sending message to Ollama API:', error);
      addMessage(`Error sending message to Ollama API: ${error.message}`, false, false);
    }
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
  
  // Create and add stop button (initially hidden)
  const stopButton = document.createElement('button');
  stopButton.id = 'stop-button';
  stopButton.textContent = 'Stop';
  stopButton.style.display = 'none';
  stopButton.style.backgroundColor = '#FF5555';
  stopButton.style.color = 'white';
  stopButton.style.border = 'none';
  stopButton.style.padding = '8px 16px';
  stopButton.style.borderRadius = '4px';
  stopButton.style.cursor = 'pointer';
  stopButton.style.fontSize = '14px';
  
  // Add stop button next to send button
  sendButton.parentNode.insertBefore(stopButton, sendButton.nextSibling);
  
  // Add event listener for stop button
  stopButton.addEventListener('click', () => {
    stopGeneration();
  });
  
  // Welcome message
  addMessage('Welcome to Tokyo Chat v1.0.0! Type `/help` to see available commands.', false, false);
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
    
    // Auto-focus the input field on startup
    messageInput.focus();
    
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
      addMessage(`Switched to model: ${selectedModel}`, false, false);
    });
    
    // Set up a timer to periodically refresh the loaded models list
    setInterval(async () => {
      await updateStatusBar();
    }, 10000); // Refresh every 10 seconds 
  } catch (error) {
    console.error('Error initializing application:', error);
    addMessage('Error initializing application. Please make sure Ollama is running on http://localhost:11434', false, false);
  }
} 