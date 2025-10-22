import React, { useState } from 'react';
import { Send, Smile, Paperclip, MoreVertical, Trash2, Plus } from 'lucide-react';

const ChatWindow = ({ 
  messages, 
  typing, 
  onlineUsers, 
  currentUser, 
  onSendMessage, 
  onAddReaction, 
  onDeleteMessage,
  loading,
  messagesEndRef 
}) => {
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [showMessageActions, setShowMessageActions] = useState(null);

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🚀'];

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  const handleEmojiReaction = (messageId, emoji) => {
    onAddReaction(messageId, emoji);
    setShowEmojiPicker(null);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  const isOwnMessage = (message) => {
    return currentUser && message.userId === currentUser.id;
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg h-96 flex flex-col">
        <div className="p-4 border-b border-white/20">
          <div className="h-6 bg-white/20 rounded w-1/3 animate-pulse"></div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start space-x-3 animate-pulse">
              <div className="w-8 h-8 bg-white/20 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-white/20 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-white/10 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg flex flex-col h-96">
      {/* Chat Header */}
      <div className="p-4 border-b border-white/20">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Team Chat</h3>
          <div className="flex items-center space-x-2">
            <div className="flex -space-x-1">
              {onlineUsers.slice(0, 3).map((user) => (
                <div
                  key={user.id}
                  className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-gray-800"
                  title={user.name}
                >
                  {user.avatar}
                </div>
              ))}
            </div>
            {onlineUsers.length > 3 && (
              <span className="text-xs text-white/60">+{onlineUsers.length - 3} more</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-white/40 mb-2">💬</div>
            <p className="text-white/60 text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex items-start space-x-3 group">
              {/* Avatar */}
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {message.userAvatar}
              </div>
              
              {/* Message Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-sm font-medium text-white">{message.userName}</span>
                  <span className="text-xs text-white/50">{formatTimestamp(message.timestamp)}</span>
                </div>
                
                {/* Message Body */}
                <div className={`inline-block p-3 rounded-lg max-w-md break-words ${
                  isOwnMessage(message)
                    ? 'bg-blue-500/20 border border-blue-400/30 text-blue-100'
                    : 'bg-white/10 border border-white/20 text-white'
                }`}>
                  <p className="text-sm leading-relaxed">{message.message}</p>
                </div>
                
                {/* Reactions */}
                {message.reactions.length > 0 && (
                  <div className="flex items-center space-x-1 mt-2">
                    {message.reactions.map((reaction, index) => (
                      <button
                        key={index}
                        onClick={() => handleEmojiReaction(message.id, reaction.emoji)}
                        className="flex items-center space-x-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-full border border-white/20 text-xs transition-colors"
                        title={reaction.users.join(', ')}
                      >
                        <span>{reaction.emoji}</span>
                        <span className="text-white/70">{reaction.users.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Message Actions */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative">
                  <button
                    onClick={() => setShowMessageActions(showMessageActions === message.id ? null : message.id)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <MoreVertical className="h-4 w-4 text-white/60" />
                  </button>
                  
                  {showMessageActions === message.id && (
                    <div className="absolute right-0 top-full mt-1 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-10 min-w-32">
                      <button
                        onClick={() => {
                          setShowEmojiPicker(message.id);
                          setShowMessageActions(null);
                        }}
                        className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        <Smile className="h-4 w-4" />
                        <span>React</span>
                      </button>
                      
                      {isOwnMessage(message) && (
                        <button
                          onClick={() => {
                            onDeleteMessage(message.id);
                            setShowMessageActions(null);
                          }}
                          className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicators */}
        {typing.length > 0 && (
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-gray-500/50 rounded-full flex items-center justify-center">
              <div className="flex space-x-1">
                <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce"></div>
                <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
            <div className="text-sm text-white/60 italic">
              {typing.length === 1 ? `${typing[0]} is typing...` : `${typing.length} people are typing...`}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl p-3 z-20">
          <div className="grid grid-cols-4 gap-2">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiReaction(showEmojiPicker, emoji)}
                className="p-2 hover:bg-white/10 rounded text-lg transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-4 border-t border-white/20">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <button
            type="button"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4 text-white/60" />
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
            />
          </div>
          
          <button
            type="button"
            onClick={() => setShowEmojiPicker(showEmojiPicker ? null : 'input')}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Add emoji"
          >
            <Smile className="h-4 w-4 text-white/60" />
          </button>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            title="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatWindow;