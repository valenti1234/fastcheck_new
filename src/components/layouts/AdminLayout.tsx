import { Outlet } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import RoleProtectedRoute from '../auth/RoleProtectedRoute';

const AdminLayout = () => {
  return (
    <RoleProtectedRoute role="superuser">
      <DashboardLayout>
        <Outlet />
      </DashboardLayout>
    </RoleProtectedRoute>
  );
};

export default AdminLayout;