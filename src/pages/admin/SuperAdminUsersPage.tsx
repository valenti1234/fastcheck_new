import React, { useState, useEffect } from 'react';
import logger from '../../utils/logger';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Visibility as Eye,
  VisibilityOff as EyeOff,
  Edit,
  VpnKey as Key,
  People as Users
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  tenant?: {
    _id: string;
    name: string;
  };
  createdAt: string;
}

interface PasswordResetForm {
  newPassword: string;
  confirmPassword: string;
}

interface EditUserForm {
  name: string;
  email: string;
  role: string;
}

const SuperAdminUsersPage: React.FC = () => {
  const { user: currentUser, isAuthenticated, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordResetForm>({
    newPassword: '',
    confirmPassword: ''
  });
  const [editForm, setEditForm] = useState<EditUserForm>({
    name: '',
    email: '',
    role: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && currentUser && currentUser.role === 'superuser') {
      fetchUsers();
    }
  }, [isAuthenticated, currentUser]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/users/superadmin/all');
      setUsers(response.data);
    } catch (error: any) {
      logger.error('Error fetching users:', error);
      const errorMessage = error.response?.data?.message || t('superAdminUsers.errors.loadUsers');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t('superAdminUsers.errors.passwordMismatch'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error(t('superAdminUsers.errors.passwordTooShort'));
      return;
    }

    try {
      await apiClient.patch(`/users/${selectedUser._id}/superadmin-reset-password`, {
        newPassword: passwordForm.newPassword
      });
      
      toast.success(t('superAdminUsers.success.passwordReset'));
      setIsPasswordDialogOpen(false);
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setSelectedUser(null);
    } catch (error) {
      logger.error('Error resetting password:', error);
      toast.error(t('superAdminUsers.errors.passwordReset'));
    }
  };

  const handleUserUpdate = async () => {
    if (!selectedUser) return;

    try {
      const response = await apiClient.put(`/users/${selectedUser._id}/superadmin-update`, editForm);
      
      // Aggiorna la lista degli utenti
      setUsers(users.map(user => 
        user._id === selectedUser._id ? { ...user, ...response.data } : user
      ));
      
      toast.success(t('superAdminUsers.success.userUpdated'));
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      logger.error("Error updating user:", error);
      toast.error(t('superAdminUsers.errors.userUpdate'));
    }
  };

  const handleToggleStatus = async (userId: string) => {
    try {
      await apiClient.patch(`/users/${userId}/superadmin-toggle-status`);
      
      // Aggiorna lo stato dell'utente nella lista
      setUsers(users.map(user => 
        user._id === userId ? { ...user, isActive: !user.isActive } : user
      ));
      
      toast.success(t('superAdminUsers.success.statusUpdated'));
    } catch (error) {
      logger.error('Error toggling user status:', error);
      toast.error(t('superAdminUsers.errors.statusToggle'));
    }
  };

  const openPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setPasswordForm({ newPassword: '', confirmPassword: '' });
    setIsPasswordDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role
    });
    setIsEditDialogOpen(true);
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.tenant?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Controllo autenticazione e permessi
  if (authLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated || !currentUser || currentUser.role !== 'superuser') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {t('superAdminUsers.messages.accessDenied')}
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>{t('superAdminUsers.messages.loadingUsers')}</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <Users />
          <Typography variant="h4" component="h1">
            {t('superAdminUsers.title')}
          </Typography>
        </Box>
        <Chip label={t('superAdminUsers.usersCount', { count: filteredUsers.length })} color="primary" />
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('superAdminUsers.search.title')}
          </Typography>
          <TextField
            fullWidth
            placeholder={t('superAdminUsers.search.placeholder') as string}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ maxWidth: 400 }}
          />
        </CardContent>
      </Card>

      <Card>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('superAdminUsers.table.headers.name')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.email')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.role')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.tenant')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.status')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.createdAt')}</TableCell>
                <TableCell>{t('superAdminUsers.table.headers.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user._id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {user.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip 
                      label={user.role} 
                      color={user.role === 'superuser' ? 'error' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {user.tenant ? (
                      <Chip label={user.tenant.name} variant="outlined" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {t('superAdminUsers.labels.noTenant')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={user.isActive ? t('superAdminUsers.labels.active') : t('superAdminUsers.labels.inactive')}
                      color={user.isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString('it-IT')}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1}>
                      <IconButton
                        size="small"
                        onClick={() => openEditDialog(user)}
                        color="primary"
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => openPasswordDialog(user)}
                        color="secondary"
                      >
                        <Key fontSize="small" />
                      </IconButton>
                      <Button
                        size="small"
                        variant={user.isActive ? 'contained' : 'outlined'}
                        color={user.isActive ? 'error' : 'primary'}
                        onClick={() => handleToggleStatus(user._id)}
                      >
                        {user.isActive ? t('superAdminUsers.actions.deactivate') : t('superAdminUsers.actions.activate')}
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Dialog per reset password */}
      <Dialog open={isPasswordDialogOpen} onClose={() => setIsPasswordDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('superAdminUsers.dialogs.resetPassword.title', { name: selectedUser?.name || '' })}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label={t('superAdminUsers.forms.password.new')}
              type={showPassword ? 'text' : 'password'}
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <TextField
              fullWidth
              label={t('superAdminUsers.forms.password.confirm')}
              type={showConfirmPassword ? 'text' : 'password'}
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <EyeOff /> : <Eye />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsPasswordDialogOpen(false)}>
            {t('superAdminUsers.actions.cancel')}
          </Button>
          <Button onClick={handlePasswordReset} variant="contained">
            {t('superAdminUsers.actions.resetPassword')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog per modifica utente */}
      <Dialog open={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('superAdminUsers.dialogs.editUser.title', { name: selectedUser?.name || '' })}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label={t('superAdminUsers.forms.user.name')}
              value={editForm.name}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <TextField
              fullWidth
              label={t('superAdminUsers.forms.user.email')}
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
            />
            <FormControl fullWidth>
              <InputLabel>{t('superAdminUsers.forms.user.role')}</InputLabel>
              <Select
                value={editForm.role}
                label={t('superAdminUsers.forms.user.role')}
                onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
              >
                <MenuItem value="user">{t('superAdminUsers.forms.roleOptions.user')}</MenuItem>
                <MenuItem value="admin">{t('superAdminUsers.forms.roleOptions.admin')}</MenuItem>
                <MenuItem value="tenant_admin">{t('superAdminUsers.forms.roleOptions.tenantAdmin')}</MenuItem>
                <MenuItem value="superuser">{t('superAdminUsers.forms.roleOptions.superuser')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsEditDialogOpen(false)}>
            {t('superAdminUsers.actions.cancel')}
          </Button>
          <Button onClick={handleUserUpdate} variant="contained">
            {t('superAdminUsers.actions.saveChanges')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SuperAdminUsersPage;