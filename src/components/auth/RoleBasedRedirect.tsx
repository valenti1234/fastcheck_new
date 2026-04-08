import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const RoleBasedRedirect = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect superusers to admin panel
  if (user.role === 'superuser') {
    return <Navigate to="/admin" replace />;
  }

  // Redirect other users to dashboard
  return <Navigate to="/dashboard" replace />;
};

export default RoleBasedRedirect;