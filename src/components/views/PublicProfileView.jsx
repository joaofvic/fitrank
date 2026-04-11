export function PublicProfileView({ userId, onBack, onSendFriendRequest }) {
  return (
    <div className="space-y-6 animate-in-fade">
      <p className="text-zinc-500 text-sm">Carregando perfil de {userId}…</p>
      <button type="button" onClick={onBack} className="text-sm text-zinc-500 hover:text-green-400">
        Voltar
      </button>
    </div>
  );
}
