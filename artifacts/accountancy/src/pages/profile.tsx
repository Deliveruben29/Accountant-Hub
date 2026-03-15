import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@workspace/replit-auth-web";
import { LogOut, User, Globe, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
];

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [selectedLang, setSelectedLang] = useState(user?.language ?? i18n.language ?? "en");
  const [saving, setSaving] = useState(false);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";

  const handleSaveLanguage = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/users/me/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ language: selectedLang }),
      });
      if (!res.ok) throw new Error();
      await i18n.changeLanguage(selectedLang);
      localStorage.setItem("i18n_language", selectedLang);
      toast({ title: t("profile.languageSaved"), description: t("profile.languageSavedDesc") });
    } catch {
      toast({ title: t("profile.languageError"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">{t("profile.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("profile.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            {user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={fullName}
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-xl">{fullName}</CardTitle>
              <p className="text-sm text-muted-foreground">{user?.email || "—"}</p>
              <Badge
                variant={user?.role === "admin" ? "default" : "secondary"}
                className="mt-1"
              >
                {user?.role === "admin" ? (
                  <><Shield className="w-3 h-3 mr-1" />{t("profile.admin")}</>
                ) : (
                  <><User className="w-3 h-3 mr-1" />{t("profile.user")}</>
                )}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground font-medium">{t("profile.name")}</p>
              <p className="mt-0.5 font-medium">{fullName}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium">{t("profile.email")}</p>
              <p className="mt-0.5 font-medium">{user?.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground font-medium">{t("profile.role")}</p>
              <p className="mt-0.5 font-medium capitalize">{user?.role || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4" />
            {t("profile.language")}
          </CardTitle>
          <CardDescription>{t("profile.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedLang} onValueChange={setSelectedLang}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSaveLanguage} disabled={saving} className="w-full">
            {saving ? t("profile.saving") : t("profile.saveLanguage")}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/20">
        <CardContent className="pt-6">
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t("profile.logOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
