import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, MIN_TOUCH } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

/** The wordmark's shape (720×220), shown 220 wide. */
const WORDMARK_WIDTH = 220;
const WORDMARK_HEIGHT = (WORDMARK_WIDTH * 220) / 720;

/** Supabase's default minimum password length. */
const MIN_PASSWORD_LENGTH = 6;

export default function SignInScreen() {
  const theme = useTheme();
  const t = useT();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const canSubmit = email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp(credentials);
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is on: Supabase sent a link and there's no session yet.
        setNotice(t('signIn.checkEmail'));
        setMode('sign-in');
        setPassword('');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) setError(error.message);
    }
    // On success the auth listener swaps this screen for the tabs.
    setBusy(false);
  }

  function switchMode() {
    setMode(isSignUp ? 'sign-in' : 'sign-up');
    setError(null);
    setNotice(null);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <Image
                source={require('@/assets/brand/spoor-wordmark.png')}
                style={{ width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT }}
                contentFit="contain"
                accessible
                accessibilityRole="header"
                accessibilityLabel="Spoor"
              />
              <ThemedText style={styles.slogan}>{t('brand.slogan')}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {isSignUp ? t('signIn.createIntro') : t('signIn.intro')}
              </ThemedText>
            </View>

            <View style={styles.fields}>
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder={t('signIn.email')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                accessibilityLabel={t('signIn.email')}
              />
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder={isSignUp ? t('signIn.newPassword', { count: MIN_PASSWORD_LENGTH }) : t('signIn.password')}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel={t('signIn.password')}
              />
            </View>

            {error && (
              <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
                {error}
              </ThemedText>
            )}
            {notice && (
              <ThemedText type="small" style={{ color: theme.goodText }} accessibilityRole="alert">
                {notice}
              </ThemedText>
            )}

            <Button
              label={isSignUp ? t('signIn.createAccount') : t('signIn.signIn')}
              onPress={submit}
              disabled={!canSubmit && !busy}
              busy={busy}
              style={styles.submit}
            />

            <Pressable
              accessibilityRole="button"
              onPress={switchMode}
              style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]}>
              <ThemedText type="small" themeColor="textSecondary">
                {isSignUp ? t('signIn.haveAccount') : t('signIn.newHere')}{' '}
                <ThemedText type="smallBold" style={{ color: theme.link }}>
                  {isSignUp ? t('signIn.signIn') : t('signIn.createAnAccount')}
                </ThemedText>
              </ThemedText>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
        <View style={styles.toggleBar}>
          <LanguageToggle />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  toggleBar: {
    paddingVertical: Spacing.two,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  slogan: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 30,
  },
  fields: {
    gap: 10,
  },
  submit: {
    marginTop: Spacing.two,
  },
  switchButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  pressed: {
    opacity: 0.7,
  },
});
