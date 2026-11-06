import * as Clipboard from 'expo-clipboard'
import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import {
  isHostAccountSignInPage,
  type HostAccountSignInProvider,
  type HostAccountSignInStatus
} from '../../../../src/shared/host-account-sign-in-types'
import { ClaudeIcon, OpenAIIcon } from '../../components/AgentIcons'
import { BottomDrawer } from '../../components/bottom-drawer/BottomDrawer'
import { TextField } from '../../components/composer-input/TextField'
import { ListGroup, ListRow } from '../../components/list/ListGroup'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { openExternalLink } from '../../platform/external-link'
import { colors, radii, spacing } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import type { RpcClient } from '../../transport/rpc-client'
import { isSignInSettled, useHostSignIn } from './use-host-sign-in'

const PROVIDER_TITLES: Record<HostAccountSignInProvider, string> = {
  claude: 'Claude',
  codex: 'Codex'
}
const ADD_PROVIDERS: readonly HostAccountSignInProvider[] = ['claude', 'codex']

function providerIcon(provider: HostAccountSignInProvider): ReactNode {
  return provider === 'claude' ? (
    <ClaudeIcon size={16} />
  ) : (
    <OpenAIIcon size={16} color={colors.textPrimary} />
  )
}

/** Adds an agent login on the host from the phone: the host runs the login, the phone opens its page and relays the code. */
export function AddAccountSheet(props: {
  visible: boolean
  client: RpcClient | null
  onClose: () => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { view, start, submitCode, reset } = useHostSignIn(props.client)

  function close() {
    reset()
    props.onClose()
  }

  return (
    <BottomDrawer visible={props.visible} onClose={close} onAfterClose={reset}>
      <Text style={styles.title}>{t('accounts.add.title', 'Add account')}</Text>
      {view.kind === 'idle' ? (
        <>
          <Text style={styles.message}>
            {t('accounts.add.choose', 'Sign in on the host. Each login becomes its own account.')}
          </Text>
          <ListGroup>
            {ADD_PROVIDERS.map((provider) => (
              <ListRow
                key={provider}
                title={PROVIDER_TITLES[provider]}
                leading={providerIcon(provider)}
                navigates
                onPress={() => void start(provider)}
              />
            ))}
          </ListGroup>
        </>
      ) : null}
      {view.kind === 'starting' ? (
        <Busy
          label={t('accounts.add.starting', 'Starting {{agent}} sign-in on the host…', {
            agent: PROVIDER_TITLES[view.provider]
          })}
        />
      ) : null}
      {view.kind === 'active' ? (
        <ActiveSignIn
          status={view.status}
          submittingCode={view.submittingCode}
          onSubmitCode={(code) => void submitCode(code)}
          onDone={close}
          onRetry={() => void start(view.status.provider)}
        />
      ) : null}
      {view.kind === 'error' ? (
        <>
          <Text style={styles.error}>{view.message}</Text>
          <View style={styles.actions}>
            <Button label={t('common.back', 'Back')} onPress={reset} />
          </View>
        </>
      ) : null}
    </BottomDrawer>
  )
}

function ActiveSignIn(props: {
  status: HostAccountSignInStatus
  submittingCode: boolean
  onSubmitCode: (code: string) => void
  onDone: () => void
  onRetry: () => void
}) {
  const t = useMobileTranslation()
  const [code, setCode] = useState('')
  const { status } = props
  const agent = PROVIDER_TITLES[status.provider]

  if (status.phase === 'signedIn') {
    return (
      <>
        <Text style={styles.message}>
          {t('accounts.add.done', '{{agent}} account added.', { agent })}
        </Text>
        <View style={styles.actions}>
          <Button primary label={t('common.done', 'Done')} onPress={props.onDone} />
        </View>
      </>
    )
  }
  if (status.phase === 'failed' || status.phase === 'cancelled') {
    return (
      <>
        <Text style={styles.error}>
          {status.error ?? t('accounts.add.cancelled', 'Sign-in was cancelled.')}
        </Text>
        <View style={styles.actions}>
          <Button label={t('common.close', 'Close')} onPress={props.onDone} />
          <Button primary label={t('accounts.add.retry', 'Try again')} onPress={props.onRetry} />
        </View>
      </>
    )
  }
  const prompt = status.prompt
  if (!prompt || status.phase === 'starting') {
    return (
      <Busy
        label={t('accounts.add.starting', 'Starting {{agent}} sign-in on the host…', { agent })}
      />
    )
  }
  if (status.phase === 'verifying' || (isSignInSettled(status) && !prompt)) {
    return <Busy label={t('accounts.add.verifying', 'Verifying sign-in…')} />
  }
  const trusted = isHostAccountSignInPage(status.provider, prompt.url)
  return (
    <>
      <Text style={styles.message}>
        {t('accounts.add.step1', '1. Open the {{agent}} sign-in page and sign in.', { agent })}
      </Text>
      <View style={styles.actions}>
        <Button
          primary
          disabled={!trusted}
          label={t('accounts.add.openPage', 'Open sign-in page')}
          onPress={() => openExternalLink(prompt.url)}
        />
      </View>
      {!trusted ? (
        <Text style={styles.error}>
          {t('accounts.add.untrusted', 'The host sent a page that is not the provider’s sign-in.')}
        </Text>
      ) : null}
      {prompt.userCode ? (
        <>
          <Text style={styles.message}>
            {t('accounts.add.step2Device', '2. Enter this code on that page.')}
          </Text>
          <Pressable
            style={styles.codeBox}
            accessibilityRole="button"
            accessibilityLabel={t('accounts.add.copyCode', 'Copy code')}
            onPress={() => void Clipboard.setStringAsync(prompt.userCode ?? '')}
          >
            <Text style={styles.code} selectable>
              {prompt.userCode}
            </Text>
          </Pressable>
        </>
      ) : null}
      {prompt.needsCode ? (
        <>
          <Text style={styles.message}>
            {t('accounts.add.step2Paste', '2. Copy the code it shows and paste it here.')}
          </Text>
          <TextField
            value={code}
            onChangeText={setCode}
            placeholder={t('accounts.add.codePlaceholder', 'Sign-in code')}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => code.trim() && props.onSubmitCode(code.trim())}
          />
          <View style={styles.actions}>
            <Button
              primary
              disabled={props.submittingCode || code.trim().length === 0}
              label={t('accounts.add.submitCode', 'Submit code')}
              onPress={() => props.onSubmitCode(code.trim())}
            />
          </View>
        </>
      ) : (
        <Busy label={t('accounts.add.waiting', 'Waiting for you to finish signing in…')} />
      )}
    </>
  )
}

function Busy(props: { label: string }) {
  useMobileColorScheme()
  return (
    <View style={styles.busy}>
      <ActivityIndicator size="small" color={colors.textSecondary} />
      <Text style={styles.message}>{props.label}</Text>
    </View>
  )
}

function Button(props: {
  label: string
  onPress: () => void
  primary?: boolean
  disabled?: boolean
}) {
  useMobileColorScheme()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        props.primary && styles.buttonPrimary,
        (pressed || props.disabled) && styles.buttonDimmed
      ]}
    >
      <Text style={props.primary ? styles.buttonPrimaryText : styles.buttonText}>
        {props.label}
      </Text>
    </Pressable>
  )
}

const styles = themedStyleSheet(() => ({
  title: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, paddingBottom: spacing.sm },
  message: { fontSize: 14, color: colors.textSecondary, marginVertical: spacing.sm },
  error: { fontSize: 13, color: colors.statusRed, marginVertical: spacing.sm },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control
  },
  buttonPrimary: { backgroundColor: colors.textPrimary },
  buttonDimmed: { opacity: 0.5 },
  buttonText: { fontSize: 15, color: colors.textPrimary },
  buttonPrimaryText: { fontSize: 15, fontWeight: '600', color: colors.bgBase },
  codeBox: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radii.surface,
    backgroundColor: colors.bgRaised
  },
  code: {
    fontSize: 24,
    letterSpacing: 2,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums']
  }
}))
