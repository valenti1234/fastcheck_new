import React, { useState } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox,
  FormControlLabel,
  Stack,
  Alert,
  SelectChangeEvent,
} from '@mui/material';
import toast from 'react-hot-toast';
import AuthzService from '../../services/authzService';
import { AuthzUser } from '../../types/auth';

export interface GrantSensibleModalProps {
  open: boolean;
  onClose: () => void;
  targetUser: Pick<AuthzUser, 'id' | 'email' | 'name'> | null;
  onSuccess?: () => void;
}

/**
 * <GrantSensibleModal> — Bloque0.7 S4.
 * Reglas:
 *   - Doble confirmacion: (1) checkbox awareness + (2) password otorgante
 *   - Q4 FASE 0/F1: Nivel por defecto = 1, max 3 niveles fijos
 *   - Permiso por defecto = 'party.query.pn' (sensible gate PN Q1)
 *   - Al finalizar llama AuthzService.grantSensible
 */
const GrantSensibleModal: React.FC<GrantSensibleModalProps> = ({
  open, onClose, targetUser, onSuccess,
}) => {
  const [permiso, setPermiso] = useState<string>('party.query.pn');
  const [nivel, setNivel] = useState<1 | 2 | 3>(1); // Q4 default 1
  const [password, setPassword] = useState('');
  const [awareness, setAwareness] = useState(false);
  const [observacion, setObservacion] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPermiso('party.query.pn');
    setNivel(1);
    setPassword('');
    setAwareness(false);
    setObservacion('');
    setBusy(false);
  };

  const puedeConfirmar = !!targetUser && awareness && password.length >= 4;

  const handleNivelChange = (e: SelectChangeEvent<number>) => {
    setNivel(Number(e.target.value) as 1 | 2 | 3);
  };

  const handleConfirmar = async () => {
    if (!puedeConfirmar || !targetUser) return;
    setBusy(true);
    try {
      await AuthzService.grantSensible(targetUser.id, {
        permiso_codigo: permiso,
        nivel,
        password_otorgante: password,
        confirm_awareness: true,
        observacion,
      });
      toast.success(`Permiso sensible ${permiso} otorgado a ${targetUser.email} (nivel ${nivel})`);
      onSuccess?.();
      onClose();
      reset();
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err.message || 'Error al otorgar permiso sensible';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        🔐 Otorgar Permiso Sensible
        {targetUser && (
          <span className="ml-2 text-sm font-normal text-slate-600">
            → {targetUser.name || ''} {targetUser.email ? `(${targetUser.email})` : ''}
          </span>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} className="pt-2">
          <Alert severity="warning">
            <strong>Gate Q1 PN:</strong> este permiso (<code>party.query.pn</code>) otorga acceso a datos
            Persona Natural. Asegúrese de justificar la necesidad y cumplir con normativa de privacidad.
          </Alert>

          <FormControl fullWidth size="small">
            <InputLabel id="lbl-permiso">Permiso sensible</InputLabel>
            <Select
              labelId="lbl-permiso"
              value={permiso}
              label="Permiso sensible"
              onChange={(e) => setPermiso(e.target.value)}
            >
              <MenuItem value="party.query.pn">party.query.pn · Consultar datos PN (Q1)</MenuItem>
              <MenuItem value="exception.authorize">exception.authorize · Autorizar excepciones</MenuItem>
              <MenuItem value="admin.grant_sensitive">admin.grant_sensitive · Delegar otorgamiento</MenuItem>
              <MenuItem value="risk.lists.manage">risk.lists.manage · CRUD listas propias</MenuItem>
              <MenuItem value="risk.params.define">risk.params.define · Parámetros riesgo</MenuItem>
              <MenuItem value="risk.thresholds.edit">risk.thresholds.edit · Umbrales semáforo</MenuItem>
              <MenuItem value="risk.formula.edit">risk.formula.edit · Fórmula riesgo final</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel id="lbl-nivel">Nivel de otorgamiento</InputLabel>
            <Select
              labelId="lbl-nivel"
              value={nivel}
              label="Nivel de otorgamiento"
              onChange={handleNivelChange}
            >
              <MenuItem value={1}>Nivel 1 · Lectura (F0 por defecto · Q4)</MenuItem>
              <MenuItem value={2}>Nivel 2 · Lectura + Exportación</MenuItem>
              <MenuItem value={3}>Nivel 3 · Lectura + Export + Acciones</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Contraseña otorgante (doble intención)"
            type="password"
            size="small"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            helperText="Por política de seguridad, el otorgante debe re-autenticarse."
          />

          <TextField
            label="Justificación / Observación"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej: Auditoría externa Trimestre X, ticket INC-1234"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={awareness}
                onChange={(e) => setAwareness(e.target.checked)}
                color="error"
              />
            }
            label={
              <DialogContentText className="text-xs">
                Entiendo que otorgar este permiso sensible expone datos confidenciales y debo
                responder por el cumplimiento de la política de tratamiento de datos personales.
              </DialogContentText>
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }} disabled={busy} color="inherit">
          Cancelar
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirmar}
          disabled={!puedeConfirmar || busy}
        >
          {busy ? 'Otorgando…' : `Otorgar Nivel ${nivel}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GrantSensibleModal;
