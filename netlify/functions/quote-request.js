const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    if (!process.env.SUPABASE_URL) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing SUPABASE_URL environment variable' }),
      };
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable' }),
      };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = JSON.parse(event.body || '{}');

    if (body['bot-field']) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }

    const requiredFields = ['full_name', 'phone', 'email', 'service_type'];

    for (const field of requiredFields) {
      if (!body[field] || String(body[field]).trim() === '') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: `Missing required field: ${field}` }),
        };
      }
    }

    const leadPayload = {
      full_name: body.full_name?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      zip_code: body.zip_code?.trim() || null,
      service_type: body.service_type?.trim() || null,
      property_type: body.property_type?.trim() || null,
      bedrooms: body.bedrooms?.trim() || null,
      bathrooms: body.bathrooms?.trim() || null,
      frequency: body.frequency?.trim() || null,
      condition: body.condition?.trim() || null,
      notes: body.notes?.trim() || null,
      source: 'website',
      status: 'new',
    };

    const { data: insertedLead, error: leadError } = await supabase
      .from('leads')
      .insert([leadPayload])
      .select()
      .single();

    if (leadError) {
      console.error('Supabase lead insert error:', leadError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Failed to save lead: ${leadError.message}`,
        }),
      };
    }

    const { error: quoteError } = await supabase
      .from('quotes')
      .insert([
        {
          lead_id: insertedLead.id,
          quote_status: 'pending',
          quote_notes: null,
        },
      ]);

    if (quoteError) {
      console.error('Supabase quote insert error:', quoteError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Failed to create quote record: ${quoteError.message}`,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        message: 'Quote request received successfully.',
        leadId: insertedLead.id,
      }),
    };
  } catch (error) {
    console.error('Function error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Something went wrong while submitting your quote request.',
      }),
    };
  }
};