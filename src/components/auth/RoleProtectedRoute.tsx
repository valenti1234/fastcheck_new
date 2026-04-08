import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface RoleProtectedRouteProps {
  role: string;
  children?: React.ReactNode;
  layout?: React.ComponentType<{ children: React.ReactNode }>;
}

const RoleProtectedRoute = ({ role, children, layout: Layout }: RoleProtectedRouteProps) => {
  const { user } = useAuth();

  if (!user || user.role !== role) {
    // Redirect to dashboard if user doesn't have required role
    return <Navigate to="/dashboard" replace />;
  }

  const content = children || <Outlet />;

  if (Layout) {
    return <Layout>{content}</Layout>;
  }

  return content;
};

export default RoleProtectedRoute;