"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Mail,
  KeyRound,
  Palette,
  Camera,
  Save,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import {
  getProfile,
  updateProfile,
  changePassword,
  updateTheme,
  requestEmailChange,
} from "@/lib/actions/profile";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
      {children}
    </label>
  );
}

function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d")!;

        // Crop quadrado centralizado
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;

        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL("image/webp", 0.8));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProfileContent() {
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { setTheme: setNextTheme } = useTheme();
  const { update: updateSession } = useSession();

  // Profile data
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<string>("dark");
  const [createdAt, setCreatedAt] = useState<string>("");

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const result = await getProfile();
      if (result.success && result.data) {
        setName(result.data.name);
        setEmail(result.data.email);
        setAvatarUrl(result.data.avatarUrl);
        setCurrentTheme(result.data.theme);
        setCreatedAt(
          new Date(result.data.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }

    try {
      const resized = await resizeImage(file, 128);
      setAvatarUrl(resized);
    } catch {
      toast.error("Erro ao processar imagem");
    }
  }

  function handleSaveProfile() {
    startTransition(async () => {
      const result = await updateProfile(name, avatarUrl);
      if (result.success) {
        await updateSession();
        toast.success("Perfil atualizado");
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    });
  }

  function handleChangeEmail() {
    if (!newEmail || !emailPassword) {
      toast.error("Preencha todos os campos");
      return;
    }

    startTransition(async () => {
      const result = await requestEmailChange(newEmail, emailPassword);
      if (result.success) {
        setEmailSent(true);
        setEmailPassword("");
        toast.success("E-mail de verificação enviado");
      } else {
        toast.error(result.error || "Erro ao solicitar alteração");
      }
    });
  }

  function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }

    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);
      if (result.success) {
        toast.success("Senha alterada com sucesso");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(result.error || "Erro ao alterar senha");
      }
    });
  }

  function handleThemeChange(theme: "dark" | "light" | "system") {
    setCurrentTheme(theme);
    setNextTheme(theme);
    startTransition(async () => {
      const result = await updateTheme(theme);
      if (result.success) {
        await updateSession();
      } else {
        toast.error(result.error || "Erro ao atualizar tema");
      }
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-xl bg-zinc-800/50 border border-zinc-800"
          />
        ))}
      </div>
    );
  }

  const themeOptions = [
    { value: "dark" as const, label: "Escuro", icon: Moon, description: "Tema escuro padrão" },
    { value: "light" as const, label: "Claro", icon: Sun, description: "Tema claro" },
    { value: "system" as const, label: "Sistema", icon: Monitor, description: "Segue o sistema operacional" },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-white tracking-tight">Perfil</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gerencie suas informações pessoais
        </p>
      </motion.div>

      {/* Avatar e Nome */}
      <motion.div variants={itemVariants}>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-zinc-200 text-base">
              <User className="h-4 w-4 text-zinc-400" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              {/* Avatar */}
              <div className="relative group">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-zinc-400">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>

              <div className="flex-1 space-y-1">
                <FieldLabel>Nome</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                  disabled={isPending}
                />
                <p className="text-xs text-zinc-500">
                  Membro desde {createdAt}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveProfile}
                disabled={isPending}
                className="bg-violet-600 hover:bg-violet-700 text-white cursor-pointer transition-all duration-200"
                size="sm"
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* E-mail */}
      <motion.div variants={itemVariants}>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-zinc-200 text-base">
              <Mail className="h-4 w-4 text-zinc-400" />
              E-mail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <FieldLabel>E-mail atual</FieldLabel>
              <Input
                value={email}
                disabled
                className="bg-zinc-800/30 border-zinc-700/50 text-zinc-400"
              />
            </div>

            {emailSent ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-3.5 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <div>
                  <p>E-mail de verificação enviado para <strong>{newEmail}</strong>.</p>
                  <p className="text-xs text-emerald-500/70 mt-1">
                    Verifique sua caixa de entrada e clique no link para confirmar.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <FieldLabel>Novo e-mail</FieldLabel>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="novo@email.com"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    disabled={isPending}
                  />
                </div>
                <div>
                  <FieldLabel>Senha atual (confirmação)</FieldLabel>
                  <Input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="********"
                    className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                    disabled={isPending}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={handleChangeEmail}
                    disabled={isPending || !newEmail || !emailPassword}
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-all duration-200"
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Alterar e-mail
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Senha */}
      <motion.div variants={itemVariants}>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-zinc-200 text-base">
              <KeyRound className="h-4 w-4 text-zinc-400" />
              Alterar Senha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <FieldLabel>Senha atual</FieldLabel>
              <div className="relative">
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="********"
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-200 pr-10"
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors duration-200"
                >
                  {showPasswords ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Nova senha</FieldLabel>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="********"
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                  disabled={isPending}
                />
              </div>
              <div>
                <FieldLabel>Confirmar nova senha</FieldLabel>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="********"
                  className="bg-zinc-800/50 border-zinc-700 text-zinc-200"
                  disabled={isPending}
                />
              </div>
            </div>

            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <div className="flex items-center gap-2 text-sm text-red-400">
                <AlertCircle className="h-3.5 w-3.5" />
                As senhas não coincidem
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleChangePassword}
                disabled={
                  isPending ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword
                }
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer transition-all duration-200"
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Alterar senha
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tema */}
      <motion.div variants={itemVariants}>
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-zinc-200 text-base">
              <Palette className="h-4 w-4 text-zinc-400" />
              Aparência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleThemeChange(option.value)}
                  disabled={isPending}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200 cursor-pointer ${
                    currentTheme === option.value
                      ? "border-violet-500 bg-violet-500/10 text-violet-400"
                      : "border-zinc-700 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                  }`}
                >
                  <option.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-[11px] text-zinc-500">{option.description}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
