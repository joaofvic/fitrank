import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Eye, EyeOff,
  Loader2, Lock, X
} from 'lucide-react';
import { ImageCropper } from '../ui/image-cropper';
import { UserAvatar } from '../ui/user-avatar.jsx';

export function EditProfileView({
  profile,
  onBack,
  onUploadAvatar,
  onUpdateProfile,
  onCheckUsername,
  onCheckEmail,
  onCheckPhone,
  onUpdateEmail,
  onUpdatePhone,
  onUpdatePassword
}) {
  const fileRef = useRef(null);
  const debounceRef = useRef(null);
  const contactDebounceRef = useRef({ email: null, phone: null });

  const [displayName, setDisplayName] = useState(profile?.display_name || profile?.nome || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [academia, setAcademia] = useState(profile?.academia || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [phoneDdd, setPhoneDdd] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState(null);

  const [usernameStatus, setUsernameStatus] = useState(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState(null);
  const [phoneChecking, setPhoneChecking] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [cropSrc, setCropSrc] = useState(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const digitsOnly = useCallback((v) => String(v ?? '').replace(/\D/g, ''), []);
  const phoneDddDigits = digitsOnly(phoneDdd).slice(0, 2);
  const phoneNumberDigits = digitsOnly(phoneNumber).slice(0, 8);
  const phoneFormatted =
    phoneDddDigits.length === 0 && phoneNumberDigits.length === 0
      ? ''
      : phoneDddDigits.length < 2
        ? `(${phoneDddDigits}`
        : phoneNumberDigits.length === 0
          ? `(${phoneDddDigits}) `
          : `(${phoneDddDigits}) 9 ${phoneNumberDigits.slice(0, 4)}${phoneNumberDigits.length > 4 ? `-${phoneNumberDigits.slice(4)}` : ''}`;

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const p = String(profile?.phone || '').replace(/\D/g, '');
    if (!p) return;
    const ddd = p.slice(0, 2);
    let tail = p.slice(2);
    if (tail.startsWith('9')) tail = tail.slice(1);
    setPhoneDdd(ddd);
    setPhoneNumber(tail.slice(0, 8));
  }, [profile?.phone]);

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('A imagem deve ter no máximo 5MB', 'error');
      return;
    }
    setCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCropConfirm = (croppedFile, previewUrl) => {
    setAvatarFile(croppedFile);
    setAvatarPreview(previewUrl);
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
  };

  useEffect(() => {
    const raw = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (raw !== username) setUsername(raw);
  }, [username]);

  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed || trimmed.length < 3) {
      setUsernameStatus(trimmed.length > 0 ? 'short' : null);
      return;
    }
    if (trimmed === (profile?.username || '').toLowerCase()) {
      setUsernameStatus('own');
      return;
    }

    setUsernameChecking(true);
    setUsernameStatus(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const available = await onCheckUsername?.(trimmed);
      setUsernameChecking(false);
      setUsernameStatus(available ? 'available' : 'taken');
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, profile?.username, onCheckUsername]);

  const originalName = profile?.display_name || profile?.nome || '';
  const originalAcademia = profile?.academia || '';
  const originalEmail = profile?.email || '';
  const originalPhoneDigits = String(profile?.phone || '').replace(/\D/g, '');
  const currentPhoneDigits = phoneDddDigits + phoneNumberDigits;
  const hasProfileChanges =
    displayName.trim() !== originalName ||
    username.trim() !== (profile?.username || '') ||
    academia.trim() !== originalAcademia ||
    avatarFile !== null;

  const hasContactChanges =
    email.trim() !== originalEmail ||
    (currentPhoneDigits.length > 0 && currentPhoneDigits !== (originalPhoneDigits.startsWith(phoneDddDigits) ? originalPhoneDigits.replace(/^(\d{2})9/, '$1') : originalPhoneDigits));

  const hasPasswordInput = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0;

  const passwordsMatch = newPassword === confirmPassword;
  const passwordValid = newPassword.length >= 6;
  const passwordFormComplete = currentPassword.length > 0 && passwordValid && passwordsMatch;

  const canSave =
    !saving &&
    (hasProfileChanges || hasContactChanges || passwordFormComplete) &&
    (!hasPasswordInput || passwordFormComplete) &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'short' &&
    emailStatus !== 'taken' &&
    phoneStatus !== 'taken' &&
    !usernameChecking &&
    !emailChecking &&
    !phoneChecking;

  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailStatus(null);
      return;
    }
    if (!trimmed.includes('@')) {
      setEmailStatus('invalid');
      return;
    }
    if (trimmed.toLowerCase() === (originalEmail || '').toLowerCase()) {
      setEmailStatus('own');
      return;
    }

    setEmailChecking(true);
    setEmailStatus(null);
    if (contactDebounceRef.current.email) clearTimeout(contactDebounceRef.current.email);
    contactDebounceRef.current.email = setTimeout(async () => {
      const available = await onCheckEmail?.(trimmed);
      setEmailChecking(false);
      setEmailStatus(available ? 'available' : 'taken');
    }, 500);

    return () => {
      if (contactDebounceRef.current.email) clearTimeout(contactDebounceRef.current.email);
    };
  }, [email, originalEmail, onCheckEmail]);

  useEffect(() => {
    const digits10 = phoneDddDigits + phoneNumberDigits;
    if (!digits10) {
      setPhoneStatus(null);
      return;
    }
    if (digits10.length < 10) {
      setPhoneStatus('short');
      return;
    }
    const currentFormatted = phoneFormatted;
    const originalDigits = String(profile?.phone || '').replace(/\D/g, '');
    const originalComparable = originalDigits.startsWith(`${phoneDddDigits}9`)
      ? `${phoneDddDigits}${originalDigits.slice(3)}`
      : originalDigits;
    if (digits10 === originalComparable) {
      setPhoneStatus('own');
      return;
    }

    setPhoneChecking(true);
    setPhoneStatus(null);
    if (contactDebounceRef.current.phone) clearTimeout(contactDebounceRef.current.phone);
    contactDebounceRef.current.phone = setTimeout(async () => {
      const available = await onCheckPhone?.(currentFormatted);
      setPhoneChecking(false);
      setPhoneStatus(available ? 'available' : 'taken');
    }, 500);

    return () => {
      if (contactDebounceRef.current.phone) clearTimeout(contactDebounceRef.current.phone);
    };
  }, [phoneDddDigits, phoneNumberDigits, phoneFormatted, profile?.phone, onCheckPhone]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
      let newAvatarUrl = undefined;

      if (avatarFile && onUploadAvatar) {
        try {
          newAvatarUrl = await onUploadAvatar(avatarFile);
        } catch (err) {
          showToast('Erro ao enviar foto. Tente novamente.', 'error');
          setSaving(false);
          return;
        }
      }

      if (hasProfileChanges && onUpdateProfile) {
        const fields = {};
        if (displayName.trim() !== originalName) {
          fields.display_name = displayName.trim();
        }
        if (username.trim() !== (profile?.username || '')) {
          fields.username = username.trim() || null;
        }
        if (academia.trim() !== originalAcademia) {
          fields.academia = academia.trim() || null;
        }
        if (newAvatarUrl !== undefined) {
          fields.avatar_url = newAvatarUrl;
        }

        if (Object.keys(fields).length > 0) {
          const { error } = await onUpdateProfile(fields);
          if (error) {
            const isUsernameTaken = error.toLowerCase().includes('unique') || error.toLowerCase().includes('duplicate');
            showToast(isUsernameTaken ? 'Nome de usuário já está em uso' : `Erro: ${error}`, 'error');
            setSaving(false);
            return;
          }
        }
      }

      // Atualizações de Auth (email/phone)
      if (email.trim() !== originalEmail && onUpdateEmail) {
        const { error } = await onUpdateEmail(email.trim());
        if (error) {
          showToast(`Erro ao atualizar e-mail: ${error}`, 'error');
          setSaving(false);
          return;
        }
        showToast('E-mail atualizado. Se necessário, confirme no seu e-mail.', 'success');
      }

      const digits10 = phoneDddDigits + phoneNumberDigits;
      if (digits10 && digits10.length === 10 && onUpdatePhone) {
        const originalDigits = String(profile?.phone || '').replace(/\D/g, '');
        const originalComparable = originalDigits.startsWith(`${phoneDddDigits}9`)
          ? `${phoneDddDigits}${originalDigits.slice(3)}`
          : originalDigits;
        if (digits10 !== originalComparable) {
          const { error } = await onUpdatePhone(phoneFormatted);
          if (error) {
            showToast(`Erro ao atualizar telefone: ${error}`, 'error');
            setSaving(false);
            return;
          }
          showToast('Telefone atualizado com sucesso.', 'success');
        }
      }

      if (passwordFormComplete && onUpdatePassword) {
        const { error } = await onUpdatePassword(currentPassword, newPassword);
        if (error) {
          showToast(error, 'error');
          setSaving(false);
          return;
        }
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordOpen(false);
        showToast('Senha alterada com sucesso!');
      }

      setAvatarFile(null);
      showToast('Perfil atualizado com sucesso');
    } catch (err) {
      showToast('Erro inesperado. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in-fade space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <h2 className="text-base font-black tracking-tight">Editar perfil</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="text-sm font-bold text-green-500 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
        </button>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative group"
        >
          <UserAvatar src={avatarPreview} size="xl" className="w-24 h-24 bg-zinc-800 ring-2 ring-zinc-700 group-hover:ring-green-500/50 transition-all" />
          <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-green-500 border-2 border-black flex items-center justify-center shadow-lg">
            <Camera className="w-3.5 h-3.5 text-black" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sm font-semibold text-green-500 hover:text-green-400 transition-colors"
        >
          Alterar foto do perfil
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleAvatarSelect}
        />
      </div>

      {/* Informações Públicas */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 px-1">
          Informações públicas
        </h3>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400 px-1">Nome</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="Seu nome completo"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400 px-1">Nome de usuário</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={30}
              placeholder="seu_username"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-10 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {usernameChecking && (
                <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
              )}
              {!usernameChecking && usernameStatus === 'available' && (
                <Check className="w-4 h-4 text-green-500" />
              )}
              {!usernameChecking && usernameStatus === 'taken' && (
                <X className="w-4 h-4 text-red-500" />
              )}
              {!usernameChecking && usernameStatus === 'own' && (
                <Check className="w-4 h-4 text-zinc-500" />
              )}
            </div>
          </div>
          {usernameStatus === 'taken' && (
            <p className="text-[11px] text-red-400 px-1">Este nome de usuário já está em uso</p>
          )}
          {usernameStatus === 'short' && (
            <p className="text-[11px] text-zinc-500 px-1">Mínimo de 3 caracteres</p>
          )}
          {usernameStatus === 'available' && (
            <p className="text-[11px] text-green-500 px-1">Disponível</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400 px-1">Academia</label>
          <input
            type="text"
            value={academia}
            onChange={(e) => setAcademia(e.target.value)}
            maxLength={60}
            placeholder="Nome da sua academia"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Contato */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 px-1">
          Contato
        </h3>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400 px-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            placeholder="seu@email.com"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
          />
          {emailChecking && (
            <p className="text-[11px] text-zinc-500 px-1">Verificando…</p>
          )}
          {!emailChecking && emailStatus === 'invalid' && (
            <p className="text-[11px] text-zinc-500 px-1">Informe um e-mail válido</p>
          )}
          {!emailChecking && emailStatus === 'taken' && (
            <p className="text-[11px] text-red-400 px-1">Este e-mail já está em uso</p>
          )}
          {!emailChecking && emailStatus === 'available' && (
            <p className="text-[11px] text-green-500 px-1">Disponível</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-400 px-1">Telefone</label>
          <div className="grid grid-cols-[88px_1fr] gap-3">
            <input
              aria-label="DDD"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-area-code"
              placeholder="11"
              value={phoneDddDigits}
              onChange={(ev) => setPhoneDdd(digitsOnly(ev.target.value))}
              maxLength={2}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
            />
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">9</span>
              <input
                aria-label="Número (8 dígitos)"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-local"
                placeholder="1234-5678"
                value={phoneNumberDigits.length <= 4 ? phoneNumberDigits : `${phoneNumberDigits.slice(0, 4)}-${phoneNumberDigits.slice(4)}`}
                onChange={(ev) => setPhoneNumber(digitsOnly(ev.target.value))}
                maxLength={9}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
              />
            </div>
          </div>
          {phoneChecking && (
            <p className="text-[11px] text-zinc-500 px-1">Verificando…</p>
          )}
          {!phoneChecking && phoneStatus === 'short' && (
            <p className="text-[11px] text-zinc-500 px-1">Informe DDD + 8 números</p>
          )}
          {!phoneChecking && phoneStatus === 'taken' && (
            <p className="text-[11px] text-red-400 px-1">Este telefone já está em uso</p>
          )}
          {!phoneChecking && phoneStatus === 'available' && (
            <p className="text-[11px] text-green-500 px-1">Disponível</p>
          )}
        </div>
      </div>

      {/* Segurança */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 px-1">
          Segurança
        </h3>

        <button
          type="button"
          onClick={() => setPasswordOpen((v) => !v)}
          className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold text-white">Alterar senha</span>
          </div>
          {passwordOpen
            ? <ChevronUp className="w-4 h-4 text-zinc-500" />
            : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </button>

        {passwordOpen && (
          <div className="space-y-3 animate-in-fade pl-1 pr-1">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Senha atual</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                maxLength={72}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Nova senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  maxLength={72}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 pr-10 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 6 && (
                <p className="text-[11px] text-red-400 px-1">Mínimo de 6 caracteres</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400">Confirmar nova senha</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                maxLength={72}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-green-500/50 transition-colors"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-[11px] text-red-400 px-1">As senhas não coincidem</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in-slide-up">
          <div
            className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold ${
              toast.type === 'error'
                ? 'bg-red-500/90 text-white'
                : 'bg-green-500/90 text-black'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {cropSrc && (
        <ImageCropper
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
