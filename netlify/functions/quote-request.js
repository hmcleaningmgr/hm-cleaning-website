const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const twilio = require('twilio');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

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
      throw new Error('Failed to save lead');
    }

    const { error: quoteError } = await supabase.from('quotes').insert([
      {
        lead_id: insertedLead.id,
        quote_status: 'pending',
        quote_notes: null,
      },
    ]);

    if (quoteError) {
      console.error('Supabase quote insert error:', quoteError);
      throw new Error('Failed to create quote record');
    }

    if (process.env.RESEND_API_KEY && process.env.FROM_EMAIL) {
      try {
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: insertedLead.email,
          subject: 'We received your H&M Cleaning quote request',
          html: `
            <div style="font-family: Arial, Helvetica, sans-serif; color: #222; line-height: 1.6;">
              <h2 style="margin-bottom: 8px;">Thanks for reaching out to H&M Cleaning LLC</h2>
              <p>Hi ${insertedLead.full_name},</p>
              <p>We received your quote request and will follow up shortly with next steps.</p>
              <p><strong>Service requested:</strong> ${insertedLead.service_type}</p>
              <p><strong>Phone:</strong> 607-349-7119</p>
              <p>We appreciate the opportunity.</p>
              <p>— H&M Cleaning LLC</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error('Resend error:', emailError);
      }
    }

    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    ) {
      try {
        await twilioClient.messages.create({
          from: process.env.TWILIO_FROM_NUMBER,
          to: insertedLead.phone,
          body: `Hi ${insertedLead.full_name}, this is H&M Cleaning LLC. We received your quote request and will follow up shortly. Call us anytime at 607-349-7119.`,
        });
      } catch (smsError) {
        console.error('Twilio error:', smsError);
      }
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
        error: 'Something went wrong while submitting your quote request.',
      }),
    };
  }
};