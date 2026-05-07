import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { UserPlus, User, Mail, Key, Briefcase, BadgeCheck, AlertCircle } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    department: ''
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      const payload = { 
        ...formData,
        role: 'USER', // Always USER for self-registration
        managerId: null, // Admin will assign later
        isDepartmentHead: false // Admin will assign later
      };
      await register(payload);
      navigate('/');
    } catch (err) {
      let msg = err?.message || 'Failed to register';
      if (msg === 'INVALID_MANAGER_ID') msg = "That Manager ID doesn't exist. Please check the ID and try again.";
      if (msg === 'EMAIL_IN_USE') msg = "That email is already registered.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page bg-gray-950 min-h-screen py-12 flex flex-col justify-center">
      <div className="auth-card w-full max-w-md mx-auto p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-xl shadow-indigo-500/10 relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4 shadow-lg shadow-indigo-500/30">
            <UserPlus className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Account</h1>
          <p className="text-gray-400 mt-2 text-sm">Join the workflow platform</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Full Name</label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                style={{ paddingLeft: "3rem" }} className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-14 pr-4 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="John Doe"
                required
                minLength={2}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="email" 
                name="email"
                value={formData.email}
                onChange={handleChange}
                style={{ paddingLeft: "3rem" }} className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-14 pr-4 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="john@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Key className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="password" 
                name="password"
                value={formData.password}
                onChange={handleChange}
                style={{ paddingLeft: "3rem" }} className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-14 pr-4 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="Min. 8 characters"
                required
                minLength={8}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Department (Optional)</label>
            <div className="relative">
              <Briefcase className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input 
                type="text" 
                name="department"
                value={formData.department}
                onChange={handleChange}
                style={{ paddingLeft: "3rem" }} className="w-full bg-gray-950 border border-gray-800 text-white rounded-lg pl-14 pr-4 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="e.g. IT, Engineering, Finance"
              />
            </div>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-indigo-300">
                <p className="font-medium mb-1">Account Setup Information</p>
                <ul className="space-y-1 text-indigo-200/80">
                  <li>• Your account will be created as a standard User</li>
                  <li>• A system administrator will assign your manager</li>
                  <li>• Department access will be configured by admin</li>
                  <li>• You'll receive an email when your account is fully configured</li>
                </ul>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading || !formData.email || !formData.password || !formData.displayName}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
