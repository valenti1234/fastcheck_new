import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SuperuserBlockedRouteProps {
  children?: React.ReactNode;
  layout?: React.ComponentType<{ children: React.ReactNode }>;
}

const SuperuserBlockedRoute = ({ children, layout: Layout }: SuperuserBlockedRouteProps) => {
  const { user } = useAuth();

  // If user is a superuser, redirect to admin dashboard
  if (user && user.role === 'superuser') {
    return <Navigate to="/admin" replace />;
  }

  const content = children || <Outlet />;

  if (Layout) {
    return <Layout>{content}</Layout>;
  }

  return content;
};

export default SuperuserBlockedRoute;