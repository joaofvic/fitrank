# Firebase Cloud Messaging (FCM) -- Guia de Setup

Este documento descreve como configurar o Firebase Cloud Messaging para push notifications no FitRank (Android, iOS e Web Push).

## 1. Criar Projeto Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Clique em **Adicionar projeto**
3. Nome do projeto: `fitrank` (ou `fitrank-prod`)
4. Desative o Google Analytics (opcional para push)
5. Clique em **Criar projeto**

## 2. Registrar App Android

1. No Firebase Console, clique em **Adicionar app** > Android
2. Package name: `com.joaofvic.fitrank` (deve coincidir com `appId` no `capacitor.config.json`)
3. Apelido: `FitRank Android`
4. Baixe o arquivo `google-services.json`
5. Coloque em: `android/app/google-services.json`

## 3. Registrar App iOS

1. No Firebase Console, clique em **Adicionar app** > iOS
2. Bundle ID: `com.joaofvic.fitrank`
3. Apelido: `FitRank iOS`
4. Baixe o arquivo `GoogleService-Info.plist`
5. Primeiro crie o projeto iOS (se ainda nao existir):
   ```bash
   npx cap add ios
   npx cap sync ios
   ```
6. Coloque o arquivo em: `ios/App/App/GoogleService-Info.plist`

### Configurar APNs no Firebase

1. No [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list), crie uma **APNs Auth Key** (`.p8`)
2. No Firebase Console > Configuracoes do projeto > Cloud Messaging > Apps iOS
3. Faca upload da APNs Auth Key, informe o Key ID e o Team ID

## 4. Registrar App Web (Web Push)

1. No Firebase Console > Configuracoes do projeto > Geral > Seus apps
2. Clique em **Adicionar app** > Web
3. Apelido: `FitRank Web`
4. Va em **Cloud Messaging** > **Web Push certificates**
5. Clique em **Gerar par de chaves** para obter as VAPID keys
6. Anote a **chave publica** (sera usada no frontend)

## 5. Gerar Chave de Conta de Servico

A Edge Function `send-push` precisa autenticar com o FCM via service account:

1. Firebase Console > Configuracoes do projeto > Contas de servico
2. Clique em **Gerar nova chave privada**
3. Baixe o arquivo JSON (ex: `fitrank-firebase-adminsdk-xxxxx.json`)
4. **NAO commite este arquivo no repositorio**

## 6. Salvar Secrets no Supabase

Execute os comandos abaixo no terminal (Supabase CLI):

```bash
# Service account JSON (uma linha, escape adequado)
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='<conteudo-do-json-inteiro>'

# VAPID keys (geradas no passo 4)
supabase secrets set VAPID_PUBLIC_KEY='BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ='
supabase secrets set VAPID_PRIVATE_KEY='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx='
```

Alternativamente, no Supabase Dashboard:
1. Va em **Settings** > **Edge Functions** > **Secrets**
2. Adicione cada secret manualmente

## 7. Verificacao

Apos configurar, verifique:

- [ ] `android/app/google-services.json` existe e tem o `package_name` correto
- [ ] Projeto iOS criado com `npx cap add ios` e `GoogleService-Info.plist` colocado em `ios/App/App/`
- [ ] APNs Auth Key (`.p8`) uploaded no Firebase Console
- [ ] VAPID key pair gerado no Firebase Console
- [ ] Secret `FIREBASE_SERVICE_ACCOUNT_JSON` salvo no Supabase
- [ ] Secret `VAPID_PUBLIC_KEY` salvo no Supabase
- [ ] Secret `VAPID_PRIVATE_KEY` salvo no Supabase

## Referencia de IDs

| Item | Valor |
|------|-------|
| App ID (Capacitor) | `com.joaofvic.fitrank` |
| Firebase Project ID | *(preencher apos criar)* |
| FCM Sender ID | *(preencher apos criar)* |
| VAPID Public Key | *(preencher apos gerar)* |
