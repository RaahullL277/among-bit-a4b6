import { useState, useEffect, useCallback } from 'react';

const useTeam = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTeamMembers();
    fetchCurrentUser();
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    try {
      setLoading(true);
      
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/members');
      // const data = await response.json();
      // setTeamMembers(data.members);

      // Using mock data for now
      const mockMembers = [
        {
          id: 1,
          name: 'Sarah Johnson',
          email: 'sarah.johnson@company.com',
          avatar: 'SJ',
          role: 'Project Manager',
          status: 'online',
          lastSeen: new Date(),
          skills: ['Project Management', 'Agile', 'Leadership'],
          tasksAssigned: 12,
          tasksCompleted: 8,
          department: 'Engineering'
        },
        {
          id: 2,
          name: 'Mike Chen',
          email: 'mike.chen@company.com',
          avatar: 'MC',
          role: 'Frontend Developer',
          status: 'online',
          lastSeen: new Date(Date.now() - 5 * 60 * 1000),
          skills: ['React', 'TypeScript', 'CSS'],
          tasksAssigned: 8,
          tasksCompleted: 6,
          department: 'Engineering'
        },
        {
          id: 3,
          name: 'Emily Davis',
          email: 'emily.davis@company.com',
          avatar: 'ED',
          role: 'UI/UX Designer',
          status: 'away',
          lastSeen: new Date(Date.now() - 30 * 60 * 1000),
          skills: ['Figma', 'User Research', 'Prototyping'],
          tasksAssigned: 6,
          tasksCompleted: 5,
          department: 'Design'
        },
        {
          id: 4,
          name: 'Alex Rodriguez',
          email: 'alex.rodriguez@company.com',
          avatar: 'AR',
          role: 'Backend Developer',
          status: 'offline',
          lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000),
          skills: ['Node.js', 'Python', 'Database'],
          tasksAssigned: 10,
          tasksCompleted: 7,
          department: 'Engineering'
        },
        {
          id: 5,
          name: 'Lisa Park',
          email: 'lisa.park@company.com',
          avatar: 'LP',
          role: 'QA Engineer',
          status: 'online',
          lastSeen: new Date(Date.now() - 2 * 60 * 1000),
          skills: ['Testing', 'Automation', 'Quality Assurance'],
          tasksAssigned: 7,
          tasksCompleted: 6,
          department: 'QA'
        }
      ];
      
      setTimeout(() => {
        setTeamMembers(mockMembers);
        setLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/current-user');
      // const data = await response.json();
      // setCurrentUser(data.user);

      // Using mock data for now
      const mockCurrentUser = {
        id: 1,
        name: 'Sarah Johnson',
        email: 'sarah.johnson@company.com',
        avatar: 'SJ',
        role: 'Project Manager'
      };
      
      setCurrentUser(mockCurrentUser);
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  }, []);

  const updateMemberStatus = useCallback(async (memberId, status) => {
    try {
      // TODO: Connect to the backend API when ready.
      // await fetch(`http://localhost:8000/api/team/members/${memberId}/status`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ status })
      // });

      setTeamMembers(prev => prev.map(member => 
        member.id === memberId ? { ...member, status, lastSeen: new Date() } : member
      ));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const inviteMember = useCallback(async (inviteData) => {
    try {
      // TODO: Connect to the backend API when ready.
      // const response = await fetch('http://localhost:8000/api/team/invite', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(inviteData)
      // });
      // const newMember = await response.json();

      // Using mock data for now
      const newMember = {
        id: Date.now(),
        name: inviteData.name,
        email: inviteData.email,
        avatar: inviteData.name.split(' ').map(n => n[0]).join(''),
        role: inviteData.role,
        status: 'offline',
        lastSeen: new Date(),
        skills: [],
        tasksAssigned: 0,
        tasksCompleted: 0,
        department: inviteData.department
      };
      
      setTeamMembers(prev => [...prev, newMember]);
      return newMember;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    teamMembers,
    currentUser,
    loading,
    error,
    updateMemberStatus,
    inviteMember
  };
};

export default useTeam;