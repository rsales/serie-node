const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mailer = require('../../modules/mailer')

const authConfig = require('../../config/auth')

const User = require('../models/User');

const router = express.Router();

// FUNÇÃO GERA O TOKEN
function generateToken(params = {}) {
  return token = jwt.sign(params, authConfig.secret, {
    expiresIn: 86400,
  })
}

// ==========
// CREATE USER
// ==========
router.post(`/register`, async (req, res) => {
  const { email } = req.body;
  try {
    // VERIFICAR SE O E-MAIL JÁ EXISTE
    if (await User.findOne({ email }))
      return res.status(400).send({ error: 'User already exists.' });

    // RETORNA A RESPONSE SEM A INFORMAÇÃO DA SENHA
    const user = await User.create(req.body);
    user.password = undefined;

    return res.send({ 
      user,
      token: generateToken({ id: user.id }),
    });
  } catch (err) {
    // RETORNA MENSAGEM DE ERRO
    return res.status(400).send({ error: 'Registration failed' });
  }
});

// ==========
// AUTHENTICATE USER - LOGIN - JWT
// ==========
router.post('/authenticate', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  // RETORNA MENSAGEM DE ERRO USER NAO EXISTE
  if (!user)
    return res.status(400).send({ error: 'User not found.' });

  // RETORNA MENSAGEM DE ERRO SENHA ERRADA
  if (!await bcrypt.compare(password, user.password))
    return res.status(400).send({ error: 'Invalid password.' });

  // REMOVE O RETORNO SEM PASSWORD
  user.password = undefined;

  res.send({ 
    user,
    token: generateToken({ id: user.id }),
  });
});

// ==========
// FORGOT PASSWORD
// ==========
router.post('/forgot_password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).send({ error: 'User not found.' });

    const token  = crypto.randomBytes(20).toString('hex');

    const now = new Date();
    now.setHours(now.getHours() + 1);

    await User.findByIdAndUpdate(user.id, {
      '$set': {
        passwordResetToken: token,
        passwordResetExpires: now,
      }
    });

    mailer.sendMail({
      to: email,
      from: 'rafael.sales93@hotmail.com',
      template: 'auth/forgot_password',
      context: { token },
    }, (err) => {
        if(err)
          return res.status(400).send({ error: 'Cannot send forgot password email' });

        return res.send();
    })
  } catch (err) {
    return res.status(400).send({ error: 'Erro on forgot password, try again' });
  }
});

// ==========
// RESET PASSWORD
// ==========
router.post('/reset_password', async (req, res) => {
  const { email, token, password } = req.body

  try {
    const user = await User.findOne({ email })
      .select('+passwordResetToken passwordResetExpires');

    if (!user)
      return res.status(400).send({ error: 'User not found.' });

    if (token !== user.passwordResetToken)
      return res.status(400).send({ error: 'Token invalid' });

    const now = new Date();

    if (now > user.passwordResetExpires)
      return res.status(400).send({ error: 'Token expired, generate a new one' });

    user.password = password;

    await user.save();

    res.send();
  } catch(err) {
    return res.status(400).send({ error: 'Cannot reset password, try again' });
  }
})

module.exports = app => app.use('/auth', router)