import React, { useState } from 'react';
import { User, Mail, Calendar, MessageCircle, Plus, Search, Filter, MoreVertical, UserPlus } from 'lucide-react';

const MemberList = ({ teamMembers, currentUser, onInviteMember, loading }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMemberActions, setShowMemberActions] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: '',
    department: ''
  });

  const statusOptions = [
    { value: 'all', label: 'All Members', count: teamMembers.length },
    { value: 'online', label: 'Online', count: teamMembers.filter(m => m.status === 'online').length },
    { value: 'away', label: 'Away', count: teamMembers.filter(m => m.status === 'away').length },
    { value: 'offline', label: 'Offline', count: teamMembers.filter(m => m.status === 'offline').length }
  ];

  const departments = ['all', 'Engineering', 'Design', 'QA', 'Product', 'Marketing'];

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-400';
      case 'away':
        return 'bg-yellow-400';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status, lastSeen) => {
    switch (status) {
      case 'online':
        return 'Online now';
      case 'away':
        return 'Away';
      case 'offline':
        const timeDiff = Date.now() - new Date(lastSeen).getTime();
        const minutes = Math.floor(timeDiff / (1000 * 60));
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (minutes < 60) return `Last seen ${minutes}m ago`;
        if (hours < 24) return `Last seen ${hours}h ago`;
        return `Last seen ${days}d ago`;
      default:
        return 'Unknown';
    }
  };

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         member.role.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    const matchesDepartment = filterDepartment === 'all' || member.department === filterDepartment;
    
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    try {
      await onInviteMember(inviteForm);
      setShowInviteModal(false);
      setInviteForm({ name: '', email: '', role: '', department: '' });
    } catch (error) {
      console.error('Error inviting member:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg p-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded mb-4 w-1/3"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-white/20 rounded mb-2 w-3/4"></div>
                <div className="h-3 bg-white/10 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Team Members</span>
            <span className="text-sm text-white/60 bg-white/20 px-2 py-1 rounded-full">
              {teamMembers.length}
            </span>
          </h2>
          
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-all"
          >
            <UserPlus className="h-4 w-4" />
            <span>Invite Member</span>
          </button>
        </div>
        
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
            />
          </div>
          
          <div className="flex space-x-3 overflow-x-auto pb-1">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilterStatus(option.value)}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium whitespace-nowrap transition-all ${
                  filterStatus === option.value
                    ? 'bg-blue-500/30 text-blue-300 border-blue-400/40'
                    : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20'
                }`}
              >
                <span>{option.label}</span>
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">{option.count}</span>
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-white/60" />
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="bg-white/10 border border-white/20 rounded text-white text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {departments.map(dept => (
                <option key={dept} value={dept} className="bg-gray-800">
                  {dept === 'all' ? 'All Departments' : dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="p-6">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-8">
            <User className="h-12 w-12 text-white/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No members found</h3>
            <p className="text-white/60">Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {/* Avatar with Status */}
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {member.avatar}
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 ${getStatusColor(member.status)} rounded-full border-2 border-gray-800`}></div>
                    </div>
                    
                    {/* Member Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold text-white truncate">{member.name}</h3>
                        {member.id === currentUser?.id && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-400/30">
                            You
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-white/70 mb-1">{member.role}</p>
                      <p className="text-xs text-white/60 mb-2">{member.department}</p>
                      
                      <div className="flex items-center space-x-3 text-xs text-white/60">
                        <span>{getStatusText(member.status, member.lastSeen)}</span>
                        <span>•</span>
                        <span>{member.tasksCompleted}/{member.tasksAssigned} tasks</span>
                      </div>
                      
                      {/* Skills */}
                      {member.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {member.skills.slice(0, 3).map((skill, index) => (
                            <span
                              key={index}
                              className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded border border-white/20"
                            >
                              {skill}
                            </span>
                          ))}
                          {member.skills.length > 3 && (
                            <span className="text-xs text-white/60">+{member.skills.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="relative">
                    <button
                      onClick={() => setShowMemberActions(showMemberActions === member.id ? null : member.id)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <MoreVertical className="h-4 w-4 text-white/60" />
                    </button>
                    
                    {showMemberActions === member.id && (
                      <div className="absolute right-0 top-full mt-1 bg-gray-800/95 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-10 min-w-40">
                        <button className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
                          <MessageCircle className="h-4 w-4" />
                          <span>Send Message</span>
                        </button>
                        
                        <button className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
                          <Mail className="h-4 w-4" />
                          <span>Send Email</span>
                        </button>
                        
                        <button className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
                          <Calendar className="h-4 w-4" />
                          <span>Schedule Meeting</span>
                        </button>
                        
                        <div className="border-t border-white/20 my-1"></div>
                        
                        <button className="flex items-center space-x-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors">
                          <User className="h-4 w-4" />
                          <span>View Profile</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">Invite Team Member</h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="Enter full name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="Enter email address"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Role *
                  </label>
                  <input
                    type="text"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="e.g., Frontend Developer"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Department *
                  </label>
                  <select
                    value={inviteForm.department}
                    onChange={(e) => setInviteForm(prev => ({ ...prev, department: e.target.value }))}
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="" className="bg-gray-800">Select Department</option>
                    {departments.filter(dept => dept !== 'all').map(dept => (
                      <option key={dept} value={dept} className="bg-gray-800">{dept}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 px-4 py-2 bg-white/10 text-white/80 border border-white/20 rounded-lg hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all"
                  >
                    Send Invite
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemberList;