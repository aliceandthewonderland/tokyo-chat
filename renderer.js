// Import marked for Markdown parsing
const { marked } = require('marked');

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

// Send message function
function sendMessage() {
  const message = messageInput.value.trim();
  
  if (message) {
    // Add the message to the chat
    addMessage(message, true);
    
    // Clear the input
    messageInput.value = '';
    
    // Here you would typically send the message to a server or another user
    // For this demo, we'll just echo back a response
    setTimeout(() => {
      addMessage(message, false);
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
  addMessage('Welcome to Tokyo Chat!\n\n- Type your message and press Enter or the Send button to send\n- Markdown formatting is supported\n- Try using **bold**, *italic*, or `code`', false);
}); 