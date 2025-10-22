import { useState, useEffect, useCallback, useRef } from 'react';

const useChat = (currentUser) => {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchMessages();
    fetchOnlineUsers();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/messages');
      // const data = await response.json();
      // setMessages(data.messages);

      // Using mock data for now
      const mockMessages = [
        {
          id: 1,
          userId: 2,
          userName: 'Mike Chen',
          userAvatar: 'MC',
          message: 'Hey team! Just finished the frontend components for the new feature.',
          timestamp: new Date(Date.now() - 60 * 60 * 1000),
          type: 'text',
          reactions: [{ emoji: '👍', users: ['Sarah Johnson'] }]
        },
        {
          id: 2,
          userId: 3,
          userName: 'Emily Davis',
          userAvatar: 'ED',
          message: 'Great work Mike! I\'ve updated the designs based on the feedback. Check them out when you have a chance.',
          timestamp: new Date(Date.now() - 45 * 60 * 1000),
          type: 'text',
          reactions: []
        },
        {
          id: 3,
          userId: 1,
          userName: 'Sarah Johnson',
          userAvatar: 'SJ',
          message: 'Perfect timing everyone! The client review is tomorrow. Let\'s make sure everything is ready.',
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          type: 'text',
          reactions: [{ emoji: '💪', users: ['Mike Chen', 'Emily Davis'] }]
        },
        {
          id: 4,
          userId: 4,
          userName: 'Alex Rodriguez',
          userAvatar: 'AR',
          message: 'API endpoints are all tested and ready. Deployment should be smooth.',
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          type: 'text',
          reactions: [{ emoji: '🚀', users: ['Sarah Johnson'] }]
        },
        {
          id: 5,
          userId: 5,
          userName: 'Lisa Park',
          userAvatar: 'LP',
          message: 'QA testing completed with no critical issues. All systems go! 🎉',
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          type: 'text',
          reactions: [{ emoji: '🎉', users: ['Sarah Johnson', 'Mike Chen'] }]
        }
      ];
      
      setTimeout(() => {
        setMessages(mockMessages);
        setLoading(false);
      }, 800);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/online');
      // const data = await response.json();
      // setOnlineUsers(data.users);

      // Using mock data for now
      const mockOnlineUsers = [
        { id: 1, name: 'Sarah Johnson', avatar: 'SJ' },
        { id: 2, name: 'Mike Chen', avatar: 'MC' },
        { id: 5, name: 'Lisa Park', avatar: 'LP' }
      ];
      
      setOnlineUsers(mockOnlineUsers);
    } catch (err) {
      console.error('Error fetching online users:', err);
    }
  }, []);

  const sendMessage = useCallback(async (messageText, type = 'text') => {
    if (!messageText.trim() || !currentUser) return;

    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/messages', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ message: messageText, type })
      // });
      // const newMessage = await response.json();

      // Using mock data for now
      const newMessage = {
        id: Date.now(),
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        message: messageText,
        timestamp: new Date(),
        type,
        reactions: []
      };
      
      setMessages(prev => [...prev, newMessage]);
    } catch (err) {
      setError(err.message);
    }
  }, [currentUser]);

  const startTyping = useCallback((userName) => {
    setTyping(prev => {
      if (!prev.includes(userName)) {
        return [...prev, userName];
      }
      return prev;
    });
  }, []);

  const stopTyping = useCallback((userName) => {
    setTyping(prev => prev.filter(name => name !== userName));
  }, []);

  const addReaction = useCallback(async (messageId, emoji) => {
    if (!currentUser) return;

    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/team/messages/${messageId}/reactions`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ emoji })
      // });

      setMessages(prev => prev.map(message => {
        if (message.id === messageId) {
          const existingReaction = message.reactions.find(r => r.emoji === emoji);
          if (existingReaction) {
            if (existingReaction.users.includes(currentUser.name)) {
              // Remove reaction
              return {
                ...message,
                reactions: message.reactions.map(r => 
                  r.emoji === emoji 
                    ? { ...r, users: r.users.filter(u => u !== currentUser.name) }
                    : r
                ).filter(r => r.users.length > 0)
              };
            } else {
              // Add user to existing reaction
              return {
                ...message,
                reactions: message.reactions.map(r => 
                  r.emoji === emoji 
                    ? { ...r, users: [...r.users, currentUser.name] }
                    : r
                )
              };
            }
          } else {
            // Add new reaction
            return {
              ...message,
              reactions: [...message.reactions, { emoji, users: [currentUser.name] }]
            };
          }
        }
        return message;
      }));
    } catch (err) {
      setError(err.message);
    }
  }, [currentUser]);

  const deleteMessage = useCallback(async (messageId) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/team/messages/${messageId}`, {
      //   method: 'DELETE'
      // });

      setMessages(prev => prev.filter(message => message.id !== messageId));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return {
    messages,
    typing,
    loading,
    error,
    onlineUsers,
    messagesEndRef,
    sendMessage,
    startTyping,
    stopTyping,
    addReaction,
    deleteMessage
  };
};

export default useChat;