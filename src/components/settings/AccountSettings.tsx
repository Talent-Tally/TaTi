import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export function AccountSettings({
  currentProfile,
  onProfileUpdated,
}: {
  currentProfile: {
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  };
  onProfileUpdated: (next: {
    email: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  }) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState(currentProfile.email);
  const [firstName, setFirstName] = useState(currentProfile.first_name ?? "");
  const [lastName, setLastName] = useState(currentProfile.last_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(currentProfile.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName,
          lastName,
          avatarUrl: avatarUrl || null,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Mise a jour impossible");
      toast.success("Profil mis a jour");
      onProfileUpdated({
        email: data.user?.email ?? email.trim(),
        first_name: data.user?.first_name ?? firstName,
        last_name: data.user?.last_name ?? lastName,
        avatar_url: data.user?.avatar_url ?? (avatarUrl || null),
      });
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise a jour impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">Mon compte</h3>
      <div className="space-y-1.5">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="account-first-name">Prenom</Label>
          <Input
            id="account-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-last-name">Nom</Label>
          <Input
            id="account-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account-avatar-url">Photo de profil (URL)</Label>
        <Input
          id="account-avatar-url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <div className="space-y-1.5">
        <Label>Apparence</Label>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            {theme === "dark" ? (
              <>
                <Moon className="h-4 w-4" />
                Sombre
              </>
            ) : (
              <>
                <Sun className="h-4 w-4" />
                Clair
              </>
            )}
          </div>
          <Switch
            checked={theme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            aria-label="Basculer entre thème clair et sombre"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="account-current-password">Mot de passe actuel</Label>
          <Input
            id="account-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Requis pour changer le mot de passe"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-new-password">Nouveau mot de passe</Label>
          <Input
            id="account-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Laisser vide si inchangé"
          />
        </div>
      </div>
      <Button onClick={save} disabled={saving || !email.trim()}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
      </Button>
    </Card>
  );
}
