import { useAuth } from '~/utils/auth';
import { z } from 'zod';
import { scopedLogger } from '~/utils/logger';
import type { user_settings } from '~/../generated/client';
import { query } from '~/utils/prisma';

const log = scopedLogger('user-settings');

const userSettingsSchema = z.object({
  applicationTheme: z.string().nullable().optional(),
  applicationLanguage: z.string().optional().default('en'),
  defaultSubtitleLanguage: z.string().nullable().optional(),
  proxyUrls: z.array(z.string()).nullable().optional(),
  traktKey: z.string().nullable().optional(),
  febboxKey: z.string().nullable().optional(),
  debridToken: z.string().nullable().optional(),
  debridService: z.string().nullable().optional(),
  enableThumbnails: z.boolean().optional().default(false),
  enableAutoplay: z.boolean().optional().default(true),
  enableSkipCredits: z.boolean().optional().default(true),
  enableDiscover: z.boolean().optional().default(true),
  enableFeatured: z.boolean().optional().default(false),
  enableDetailsModal: z.boolean().optional().default(false),
  enableImageLogos: z.boolean().optional().default(true),
  enableCarouselView: z.boolean().optional().default(false),
  forceCompactEpisodeView: z.boolean().optional().default(false),
  sourceOrder: z.array(z.string()).optional().default([]),
  enableSourceOrder: z.boolean().optional().default(false),
  disabledSources: z.array(z.string()).optional().default([]),
  embedOrder: z.array(z.string()).optional().default([]),
  enableEmbedOrder: z.boolean().optional().default(false),
  disabledEmbeds: z.array(z.string()).optional().default([]),
  proxyTmdb: z.boolean().optional().default(false),
  enableLowPerformanceMode: z.boolean().optional().default(false),
  enableNativeSubtitles: z.boolean().optional().default(false),
  enableHoldToBoost: z.boolean().optional().default(false),
  homeSectionOrder: z.array(z.string()).optional().default([]),
  manualSourceSelection: z.boolean().optional().default(false),
  enableDoubleClickToSeek: z.boolean().optional().default(false),
});

export default defineEventHandler(async event => {
  const userId = event.context.params?.id;
  const session = await useAuth().getCurrentSession();

  if (session.user !== userId) {
    throw createError({ statusCode: 403, message: 'Permission denied' });
  }

  /* ---------------- USER EXISTS ---------------- */

  const { rows: users } = await query(
    'SELECT id FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  
  if (!users.length) {
    throw createError({ statusCode: 404, message: 'User not found' });
  }  

  /* ---------------- GET ---------------- */

  if (event.method === 'GET') {
    const { rows } = await query(
      'SELECT * FROM user_settings WHERE id = $1 LIMIT 1',
      [userId]
    );
    
    const settings = rows[0] as user_settings | undefined;
    

    return {
      id: userId,
      applicationTheme: settings?.application_theme ?? null,
      applicationLanguage: settings?.application_language ?? 'en',
      defaultSubtitleLanguage: settings?.default_subtitle_language ?? null,
      proxyUrls: settings?.proxy_urls?.length ? settings.proxy_urls : null,
      traktKey: settings?.trakt_key ?? null,
      febboxKey: settings?.febbox_key ?? null,
      debridToken: settings?.debrid_token ?? null,
      debridService: settings?.debrid_service ?? null,
      enableThumbnails: settings?.enable_thumbnails ?? false,
      enableAutoplay: settings?.enable_autoplay ?? true,
      enableSkipCredits: settings?.enable_skip_credits ?? true,
      enableDiscover: settings?.enable_discover ?? true,
      enableFeatured: settings?.enable_featured ?? false,
      enableDetailsModal: settings?.enable_details_modal ?? false,
      enableImageLogos: settings?.enable_image_logos ?? true,
      enableCarouselView: settings?.enable_carousel_view ?? false,
      forceCompactEpisodeView: settings?.force_compact_episode_view ?? false,
      sourceOrder: settings?.source_order ?? [],
      enableSourceOrder: settings?.enable_source_order ?? false,
      disabledSources: settings?.disabled_sources ?? [],
      embedOrder: settings?.embed_order ?? [],
      enableEmbedOrder: settings?.enable_embed_order ?? false,
      disabledEmbeds: settings?.disabled_embeds ?? [],
      proxyTmdb: settings?.proxy_tmdb ?? false,
      enableLowPerformanceMode: settings?.enable_low_performance_mode ?? false,
      enableNativeSubtitles: settings?.enable_native_subtitles ?? false,
      enableHoldToBoost: settings?.enable_hold_to_boost ?? false,
      homeSectionOrder: settings?.home_section_order ?? [],
      manualSourceSelection: settings?.manual_source_selection ?? false,
      enableDoubleClickToSeek: settings?.enable_double_click_to_seek ?? false,
    };
  }

  /* ---------------- PUT (UPSERT) ---------------- */

  if (event.method === 'PUT') {
    const body = userSettingsSchema.parse(await readBody(event));

    await query(
      `
      INSERT INTO user_settings (
        id,
        application_theme,
        application_language,
        default_subtitle_language,
        proxy_urls,
        trakt_key,
        febbox_key,
        debrid_token,
        debrid_service,
        enable_thumbnails,
        enable_autoplay,
        enable_skip_credits,
        enable_discover,
        enable_featured,
        enable_details_modal,
        enable_image_logos,
        enable_carousel_view,
        force_compact_episode_view,
        source_order,
        enable_source_order,
        disabled_sources,
        embed_order,
        enable_embed_order,
        disabled_embeds,
        proxy_tmdb,
        enable_low_performance_mode,
        enable_native_subtitles,
        enable_hold_to_boost,
        home_section_order,
        manual_source_selection,
        enable_double_click_to_seek
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
      )
      ON CONFLICT (id) DO UPDATE SET
        application_theme = EXCLUDED.application_theme,
        application_language = EXCLUDED.application_language,
        default_subtitle_language = EXCLUDED.default_subtitle_language,
        proxy_urls = EXCLUDED.proxy_urls,
        trakt_key = EXCLUDED.trakt_key,
        febbox_key = EXCLUDED.febbox_key,
        debrid_token = EXCLUDED.debrid_token,
        debrid_service = EXCLUDED.debrid_service,
        enable_thumbnails = EXCLUDED.enable_thumbnails,
        enable_autoplay = EXCLUDED.enable_autoplay,
        enable_skip_credits = EXCLUDED.enable_skip_credits,
        enable_discover = EXCLUDED.enable_discover,
        enable_featured = EXCLUDED.enable_featured,
        enable_details_modal = EXCLUDED.enable_details_modal,
        enable_image_logos = EXCLUDED.enable_image_logos,
        enable_carousel_view = EXCLUDED.enable_carousel_view,
        force_compact_episode_view = EXCLUDED.force_compact_episode_view,
        source_order = EXCLUDED.source_order,
        enable_source_order = EXCLUDED.enable_source_order,
        disabled_sources = EXCLUDED.disabled_sources,
        embed_order = EXCLUDED.embed_order,
        enable_embed_order = EXCLUDED.enable_embed_order,
        disabled_embeds = EXCLUDED.disabled_embeds,
        proxy_tmdb = EXCLUDED.proxy_tmdb,
        enable_low_performance_mode = EXCLUDED.enable_low_performance_mode,
        enable_native_subtitles = EXCLUDED.enable_native_subtitles,
        enable_hold_to_boost = EXCLUDED.enable_hold_to_boost,
        home_section_order = EXCLUDED.home_section_order,
        manual_source_selection = EXCLUDED.manual_source_selection,
        enable_double_click_to_seek = EXCLUDED.enable_double_click_to_seek
      `,
      [
        userId,
        body.applicationTheme,
        body.applicationLanguage,
        body.defaultSubtitleLanguage,
        body.proxyUrls ?? [],
        body.traktKey,
        body.febboxKey,
        body.debridToken,
        body.debridService,
        body.enableThumbnails,
        body.enableAutoplay,
        body.enableSkipCredits,
        body.enableDiscover,
        body.enableFeatured,
        body.enableDetailsModal,
        body.enableImageLogos,
        body.enableCarouselView,
        body.forceCompactEpisodeView,
        body.sourceOrder,
        body.enableSourceOrder,
        body.disabledSources,
        body.embedOrder,
        body.enableEmbedOrder,
        body.disabledEmbeds,
        body.proxyTmdb,
        body.enableLowPerformanceMode,
        body.enableNativeSubtitles,
        body.enableHoldToBoost,
        body.homeSectionOrder,
        body.manualSourceSelection,
        body.enableDoubleClickToSeek,
      ]
    );    

    return { success: true };
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
