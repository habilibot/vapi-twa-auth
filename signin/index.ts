import { createClient } from "https://esm.sh/@shaple/shaple@0.2.2";
import { validateTelegramWebAppData } from '../utils/telegram.ts';
import { TWAUser } from '../_dto/user.ts';

/**
 * Handle the sign in with telegram web app data and bot token
 * Create a new user if not exists
 * @param req
 */
export default async (req: Request) => {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const passwordPrefix = Deno.env.get('PWD_PREFIX');
  const twaAuthExpireInSeconds = Deno.env.get('TWA_EXPIRE');
  const data = await req.json();
  const telegramInitData = data?.telegramInitData;

  if (!telegramInitData) {
    return new Response('telegramInitData required', {
      status: 400,
    });
  }

  const {
    validatedData,
    user: telegramUser,
    message,
  } = validateTelegramWebAppData(
    telegramInitData,
    botToken,
    twaAuthExpireInSeconds,
  );

  if (!validatedData) {
    return new Response(JSON.stringify(`Invalid Telegram data: ${message}`), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const telegramId = telegramUser.id?.toString();
  const telegramUsername = telegramUser.username ?? '';
  if (!telegramId) {
    return new Response(JSON.stringify('Invalid user data'), {
      headers: {'Content-Type': 'application/json' },
      status: 400,
    });
  }

  // setup shaple client
  const client = createClient(
    Deno.env.get('SHAPLE_URL') ?? '',
    Deno.env.get('SHAPLE_SERVICE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  // Step 1: Find user by telegramId
  let { data: twaUser, error } = await client
    .schema('twa_auth')
    .from('telegram_user')
    .select()
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  // Step 2: If twa user does not exist, create new user and twa user
  if (!twaUser) {
    const { data: authUserData, error } = await client.auth.admin.createUser({
      email: getEmail(telegramId), // Generate a dummy email
      password: getPassword(passwordPrefix, telegramId), // Generate a password
      email_confirm: true,
    });

    if (!authUserData || error) {
      return new Response(
        JSON.stringify({ error: 'Failed to create auth user' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }
    const userId = authUserData.user.id;

    const { data: newTwaUser, error: insertError } = await client
      .schema('twa_auth')
      .from('telegram_user')
      .insert({
        telegram_id: telegramId,
        owner: userId,
        telegram_username: telegramUsername,
      })
      .select()
      .single();

    if (insertError) {
      console.error(insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create userGameData' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        },
      );
    }

    twaUser = newTwaUser;
  }

  // Step 3: If twa user exists, sign in and return user data
  const { data: signInResult, error: signInError } =
    await client.auth.signInWithPassword({
      email: getEmail(telegramId),
      password: getPassword(passwordPrefix, telegramId),
    });

  if (signInError) {
    console.error(signInError);
    return new Response(JSON.stringify({ error: signInError.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  const result = {
    id: twaUser.id,
    authUserId: twaUser.owner,
    telegramId: twaUser.telegram_id,
    telegramUsername: twaUser.telegram_username,
    isPremium: twaUser.is_premium,
    accessToken: signInResult.session.access_token ?? '',
  } as TWAUser;

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
};

function getEmail(telegramId: string) {
  return `${telegramId}@twa-user.com`;
}
function getPassword(secretPrefix: string, telegramId: string) {
  return `${secretPrefix}_${telegramId}__`;
}
