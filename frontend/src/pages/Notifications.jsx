import React from 'react';

const Notifications = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20">
        <h1 className="text-4xl font-bold text-white mb-4">Notifications</h1>
        <p className="text-white/70">Manage your alerts and notifications</p>
      </div>
    </div>
  );
};

export default Notifications;