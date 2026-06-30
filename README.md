# Meu Razão — Controle Financeiro

App de controle financeiro pessoal: lançamentos de receita/despesa, contas e cartões, categorias com gráficos e metas de orçamento mensal. Funciona em qualquer dispositivo (celular, computador) porque os dados ficam salvos no Firebase (gratuito).

Este guia parte do zero. Vai levar uns 15-20 minutos.

---

## 1. Criar o projeto no Firebase (o banco de dados)

1. Acesse **https://console.firebase.google.com** e faça login com sua conta Google.
2. Clique em **"Adicionar projeto"**, dê um nome (ex: `meu-razao`) e siga os passos (pode desativar o Google Analytics, não é necessário).
3. Dentro do projeto, no menu lateral, clique no ícone **`</>`** (Web) para registrar um app web.
   - Dê um apelido (ex: `meu-razao-web`) e clique em **"Registrar app"**.
   - Você vai ver um bloco de código com `const firebaseConfig = {...}`. **Copie esses valores** — vai precisar deles no passo 4.
4. No menu lateral, vá em **Build → Authentication → Get started**.
   - Na aba "Sign-in method", clique em **"E-mail/senha"** e ative (toggle azul) → Salvar.
5. No menu lateral, vá em **Build → Firestore Database → Create database**.
   - Escolha a localização mais próxima de você (ex: `southamerica-east1` para o Brasil).
   - Comece em **modo de produção** (vamos configurar as regras no próximo passo).
6. Ainda em Firestore, clique na aba **"Regras" (Rules)** e substitua o conteúdo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

   Clique em **"Publicar"**. Isso garante que cada pessoa só acessa os próprios dados.

---

## 2. Colar a configuração no código

Abra o arquivo `js/firebase-config.js` e substitua pelos valores que você copiou no passo 1.3:

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "meu-razao.firebaseapp.com",
  projectId: "meu-razao",
  storageBucket: "meu-razao.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

> Essas chaves não são secretas como uma senha — elas só identificam o projeto. Quem te protege é a regra do Firestore do passo 1.6, que exige login para ler/escrever dados.

---

## 3. Subir para o GitHub

1. Crie uma conta em **https://github.com** se ainda não tiver.
2. Clique em **"New repository"**, dê um nome (ex: `meu-razao`), deixe como **Public** (necessário para o GitHub Pages gratuito) e clique em **"Create repository"**.
3. No seu computador, na pasta do projeto, rode estes comandos no terminal (um de cada vez):

```bash
git init
git add .
git commit -m "Primeira versão do app de finanças"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/meu-razao.git
git push -u origin main
```

   Troque `SEU-USUARIO` pelo seu nome de usuário do GitHub. Se nunca usou Git, instale em **https://git-scm.com/downloads** primeiro.

   **Alternativa sem terminal:** na página do repositório no GitHub, clique em "uploading an existing file" e arraste todos os arquivos da pasta.

---

## 4. Ativar o GitHub Pages

1. No repositório, vá em **Settings → Pages** (menu lateral esquerdo).
2. Em "Branch", escolha **main** e a pasta **/ (root)** → **Save**.
3. Aguarde 1-2 minutos. Seu site vai ficar disponível em:
   `https://SEU-USUARIO.github.io/meu-razao/`

---

## 5. Usar o app

1. Abra o link do passo 4 no celular ou computador.
2. Clique em **"Criar conta"**, informe e-mail e senha (mínimo 6 caracteres).
3. Cadastre suas **contas/cartões** primeiro (aba "Contas e cartões").
4. Cadastre ou ajuste suas **categorias** (já vem com algumas prontas).
5. Comece a lançar receitas e despesas em **"Lançamentos"**.
6. Defina metas mensais por categoria em **"Metas"**.

Como o app usa login com e-mail/senha, você pode acessar os mesmos dados de qualquer aparelho — é só entrar com a mesma conta.

---

## Estrutura dos arquivos

```
index.html          → estrutura da página
css/style.css        → visual do app
js/firebase-config.js → suas chaves do Firebase (editar aqui)
js/app.js             → toda a lógica (login, lançamentos, gráficos)
```

## Dúvidas comuns

- **"Firebase: Error (auth/configuration-not-found)"** → você esqueceu de ativar o método "E-mail/senha" no passo 1.4.
- **Tela em branco** → abra o Console do navegador (F12) e veja o erro; o mais comum é `firebase-config.js` ainda com os valores de exemplo.
- **Quero deixar o repositório privado** → dá para usar GitHub Pages com repositório privado apenas em planos pagos (GitHub Pro/Team). Em conta gratuita, mantenha público — seus dados financeiros continuam protegidos no Firebase, só o *código* do site fica visível.
