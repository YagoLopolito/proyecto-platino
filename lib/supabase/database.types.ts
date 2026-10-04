export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      ai_game_plans: {
        Row: {
          created_at: string;
          game_id: string;
          id: string;
          model: string;
          payload_json: Json;
          status: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          game_id: string;
          id?: string;
          model: string;
          payload_json: Json;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          game_id?: string;
          id?: string;
          model?: string;
          payload_json?: Json;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_game_plans_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_game_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_recommendations: {
        Row: {
          created_at: string;
          id: string;
          model: string;
          payload_json: Json;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          model: string;
          payload_json: Json;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          model?: string;
          payload_json?: Json;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      friendships: {
        Row: {
          created_at: string;
          friend_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          friend_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          friend_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey";
            columns: ["friend_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friendships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          id: string;
          igdb_id: number;
          name: string;
          slug: string;
          logo_url: string | null;
          description: string | null;
          country: string | null;
          parent_igdb_id: number | null;
          games_cache: Json | null;
          games_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          igdb_id: number;
          name: string;
          slug: string;
          logo_url?: string | null;
          description?: string | null;
          country?: string | null;
          parent_igdb_id?: number | null;
          games_cache?: Json | null;
          games_checked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          igdb_id?: number;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          description?: string | null;
          country?: string | null;
          parent_igdb_id?: number | null;
          games_cache?: Json | null;
          games_checked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      game_companies: {
        Row: { game_id: string; company_id: string; role: string };
        Insert: { game_id: string; company_id: string; role: string };
        Update: { game_id?: string; company_id?: string; role?: string };
        Relationships: [
          {
            foreignKeyName: "game_companies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_companies_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      game_diary_entries: {
        Row: {
          completed_at: string | null;
          created_at: string;
          finished_on: string;
          game_id: string;
          id: string;
          platinum_earned_at: string | null;
          playthrough_number: number;
          rating: number | null;
          review: string | null;
          source: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          finished_on: string;
          game_id: string;
          id?: string;
          platinum_earned_at?: string | null;
          playthrough_number?: number;
          rating?: number | null;
          review?: string | null;
          source?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          finished_on?: string;
          game_id?: string;
          id?: string;
          platinum_earned_at?: string | null;
          playthrough_number?: number;
          rating?: number | null;
          review?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_diary_entries_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_diary_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      game_screenshots: {
        Row: {
          caption: string | null;
          created_at: string;
          game_id: string;
          id: string;
          storage_path: string;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          completed_at?: string | null;
          created_at?: string;
          game_id: string;
          id?: string;
          storage_path: string;
          user_id: string;
        };
        Update: {
          caption?: string | null;
          completed_at?: string | null;
          created_at?: string;
          game_id?: string;
          id?: string;
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_screenshots_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_screenshots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      game_external_guides: {
        Row: {
          created_at: string;
          game_id: string;
          id: string;
          source: string;
          source_type: string;
          title: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          game_id: string;
          id?: string;
          source: string;
          source_type: string;
          title: string;
          url: string;
        };
        Update: {
          created_at?: string;
          game_id?: string;
          id?: string;
          source?: string;
          source_type?: string;
          title?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_external_guides_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          background_url: string | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          description_source: string | null;
          developer: string | null;
          external_catalog_id: string | null;
          icon_url: string | null;
          id: string;
          name: string;
          np_comm_id: string | null;
          platform: string | null;
          release_year: number | null;
          source: string;
          steam_appid: number | null;
          steam_has_achievements: boolean | null;
          time_estimates_checked_at: string | null;
          igdb_id: number | null;
          companies_checked_at: string | null;
          time_estimates_source: string | null;
          time_to_beat_minutes: number | null;
          time_to_complete_minutes: number | null;
          updated_at: string;
        };
        Insert: {
          background_url?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          description_source?: string | null;
          developer?: string | null;
          external_catalog_id?: string | null;
          icon_url?: string | null;
          id?: string;
          name: string;
          np_comm_id?: string | null;
          platform?: string | null;
          release_year?: number | null;
          source?: string;
          steam_appid?: number | null;
          steam_has_achievements?: boolean | null;
          time_estimates_checked_at?: string | null;
          igdb_id?: number | null;
          companies_checked_at?: string | null;
          time_estimates_source?: string | null;
          time_to_beat_minutes?: number | null;
          time_to_complete_minutes?: number | null;
          updated_at?: string;
        };
        Update: {
          background_url?: string | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          description_source?: string | null;
          developer?: string | null;
          external_catalog_id?: string | null;
          icon_url?: string | null;
          id?: string;
          name?: string;
          np_comm_id?: string | null;
          platform?: string | null;
          release_year?: number | null;
          source?: string;
          steam_appid?: number | null;
          steam_has_achievements?: boolean | null;
          time_estimates_checked_at?: string | null;
          igdb_id?: number | null;
          companies_checked_at?: string | null;
          time_estimates_source?: string | null;
          time_to_beat_minutes?: number | null;
          time_to_complete_minutes?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "games_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_steps: {
        Row: {
          content: string;
          created_at: string;
          guide_id: string;
          id: string;
          step_order: number;
          trophy_id: string | null;
        };
        Insert: {
          content: string;
          created_at?: string;
          guide_id: string;
          id?: string;
          step_order: number;
          trophy_id?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string;
          guide_id?: string;
          id?: string;
          step_order?: number;
          trophy_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "guide_steps_guide_id_fkey";
            columns: ["guide_id"];
            isOneToOne: false;
            referencedRelation: "guides";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guide_steps_trophy_id_fkey";
            columns: ["trophy_id"];
            isOneToOne: false;
            referencedRelation: "trophies";
            referencedColumns: ["id"];
          },
        ];
      };
      guides: {
        Row: {
          author_id: string;
          content_markdown: string | null;
          created_at: string;
          external_url: string | null;
          game_id: string;
          id: string;
          source: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          content_markdown?: string | null;
          created_at?: string;
          external_url?: string | null;
          game_id: string;
          id?: string;
          source?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          content_markdown?: string | null;
          created_at?: string;
          external_url?: string | null;
          game_id?: string;
          id?: string;
          source?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guides_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guides_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      list_likes: {
        Row: {
          created_at: string;
          list_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          list_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          list_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_likes_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "user_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      now_playing: {
        Row: {
          end_reason: string | null;
          ended_at: string | null;
          game_id: string;
          id: string;
          started_at: string;
          user_id: string;
        };
        Insert: {
          end_reason?: string | null;
          ended_at?: string | null;
          game_id: string;
          id?: string;
          started_at?: string;
          user_id: string;
        };
        Update: {
          end_reason?: string | null;
          ended_at?: string | null;
          game_id?: string;
          id?: string;
          started_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "now_playing_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "now_playing_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      post_comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          display_path: string | null;
          duration_seconds: number | null;
          height: number;
          id: string;
          media_type: string;
          mime_type: string;
          position: number;
          post_id: string;
          poster_path: string | null;
          size_bytes: number;
          storage_path: string;
          width: number;
        };
        Insert: {
          display_path?: string | null;
          duration_seconds?: number | null;
          height: number;
          id?: string;
          media_type: string;
          mime_type: string;
          position: number;
          post_id: string;
          poster_path?: string | null;
          size_bytes: number;
          storage_path: string;
          width: number;
        };
        Update: {
          display_path?: string | null;
          duration_seconds?: number | null;
          height?: number;
          id?: string;
          media_type?: string;
          mime_type?: string;
          position?: number;
          post_id?: string;
          poster_path?: string | null;
          size_bytes?: number;
          storage_path?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          caption: string | null;
          created_at: string;
          edited_at: string | null;
          game_id: string;
          id: string;
          is_spoiler: boolean;
          published_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          edited_at?: string | null;
          game_id: string;
          id?: string;
          is_spoiler?: boolean;
          published_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          edited_at?: string | null;
          game_id?: string;
          id?: string;
          is_spoiler?: boolean;
          published_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      psn_accounts: {
        Row: {
          account_id: string;
          avatar_url: string | null;
          created_at: string;
          id: string;
          last_synced_at: string | null;
          npsso_encrypted: string;
          online_id: string;
          token_status: string;
          updated_at: string;
          user_id: string;
          earned_bronze: number | null;
          earned_gold: number | null;
          earned_platinum: number | null;
          earned_silver: number | null;
          trophy_level: number | null;
          trophy_progress: number | null;
          trophy_tier: number | null;
        };
        Insert: {
          account_id: string;
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          npsso_encrypted: string;
          online_id: string;
          token_status?: string;
          updated_at?: string;
          user_id: string;
          earned_bronze?: number | null;
          earned_gold?: number | null;
          earned_platinum?: number | null;
          earned_silver?: number | null;
          trophy_level?: number | null;
          trophy_progress?: number | null;
          trophy_tier?: number | null;
        };
        Update: {
          account_id?: string;
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          npsso_encrypted?: string;
          online_id?: string;
          token_status?: string;
          updated_at?: string;
          user_id?: string;
          earned_bronze?: number | null;
          earned_gold?: number | null;
          earned_platinum?: number | null;
          earned_silver?: number | null;
          trophy_level?: number | null;
          trophy_progress?: number | null;
          trophy_tier?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "psn_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recent_searches: {
        Row: {
          id: string;
          query: string;
          scope: string;
          searched_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          query: string;
          scope: string;
          searched_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          query?: string;
          scope?: string;
          searched_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recent_searches_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      review_likes: {
        Row: {
          created_at: string;
          entry_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          entry_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          entry_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_likes_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "game_diary_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      steam_accounts: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          id: string;
          last_synced_at: string | null;
          persona_name: string;
          profile_visibility: string;
          steam_id64: string;
          updated_at: string;
          user_id: string;
          verified: boolean;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          persona_name: string;
          profile_visibility?: string;
          steam_id64: string;
          updated_at?: string;
          user_id: string;
          verified?: boolean;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          persona_name?: string;
          profile_visibility?: string;
          steam_id64?: string;
          updated_at?: string;
          user_id?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "steam_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      system_list_items: {
        Row: {
          game_id: string;
          list_slug: string;
          position: number;
        };
        Insert: {
          game_id: string;
          list_slug: string;
          position: number;
        };
        Update: {
          game_id?: string;
          list_slug?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "system_list_items_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "system_list_items_list_slug_fkey";
            columns: ["list_slug"];
            isOneToOne: false;
            referencedRelation: "system_lists";
            referencedColumns: ["slug"];
          },
        ];
      };
      system_lists: {
        Row: {
          item_count: number;
          refreshed_at: string;
          release_year: number | null;
          slug: string;
        };
        Insert: {
          item_count?: number;
          refreshed_at?: string;
          release_year?: number | null;
          slug: string;
        };
        Update: {
          item_count?: number;
          refreshed_at?: string;
          release_year?: number | null;
          slug?: string;
        };
        Relationships: [];
      };
      trophies: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          earned_rate: number | null;
          game_id: string;
          hidden: boolean;
          icon_url: string | null;
          id: string;
          name: string;
          progress_target: string | null;
          rarity: number | null;
          sort_order: number | null;
          trophy_group_id: string | null;
          trophy_id: string | null;
          type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          earned_rate?: number | null;
          game_id: string;
          hidden?: boolean;
          icon_url?: string | null;
          id?: string;
          name: string;
          progress_target?: string | null;
          rarity?: number | null;
          sort_order?: number | null;
          trophy_group_id?: string | null;
          trophy_id?: string | null;
          type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          earned_rate?: number | null;
          game_id?: string;
          hidden?: boolean;
          icon_url?: string | null;
          id?: string;
          name?: string;
          progress_target?: string | null;
          rarity?: number | null;
          sort_order?: number | null;
          trophy_group_id?: string | null;
          trophy_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trophies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trophies_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      trophy_groups: {
        Row: {
          created_at: string;
          created_by: string | null;
          game_id: string;
          group_id: string;
          icon_url: string | null;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          game_id: string;
          group_id: string;
          icon_url?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          game_id?: string;
          group_id?: string;
          icon_url?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trophy_groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trophy_groups_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      user_favorite_games: {
        Row: {
          created_at: string;
          game_id: string;
          slot: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          game_id: string;
          slot: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          game_id?: string;
          slot?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_favorite_games_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_favorite_games_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_games: {
        Row: {
          added_at: string;
          game_id: string;
          id: string;
          keep_playing_dismissed_at: string | null;
          last_played_at: string | null;
          play_suggestion_dismissed_at: string | null;
          playtime_minutes: number | null;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          game_id: string;
          id?: string;
          keep_playing_dismissed_at?: string | null;
          last_played_at?: string | null;
          play_suggestion_dismissed_at?: string | null;
          playtime_minutes?: number | null;
          user_id: string;
        };
        Update: {
          added_at?: string;
          game_id?: string;
          id?: string;
          keep_playing_dismissed_at?: string | null;
          last_played_at?: string | null;
          play_suggestion_dismissed_at?: string | null;
          playtime_minutes?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_games_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_games_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_guide_progress: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          created_at: string;
          guide_step_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          guide_step_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          guide_step_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_guide_progress_guide_step_id_fkey";
            columns: ["guide_step_id"];
            isOneToOne: false;
            referencedRelation: "guide_steps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_guide_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_list_items: {
        Row: {
          game_id: string;
          list_id: string;
          note: string | null;
          position: number;
        };
        Insert: {
          game_id: string;
          list_id: string;
          note?: string | null;
          position: number;
        };
        Update: {
          game_id?: string;
          list_id?: string;
          note?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_list_items_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "user_lists";
            referencedColumns: ["id"];
          },
        ];
      };
      user_lists: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_ranked: boolean;
          title: string;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_ranked?: boolean;
          title: string;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_ranked?: boolean;
          title?: string;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_playlist: {
        Row: {
          added_at: string;
          game_id: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          game_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          game_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_playlist_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_playlist_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_trophies: {
        Row: {
          created_at: string;
          id: string;
          trophy_id: string;
          unlocked_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          trophy_id: string;
          unlocked_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          trophy_id?: string;
          unlocked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_trophies_trophy_id_fkey";
            columns: ["trophy_id"];
            isOneToOne: false;
            referencedRelation: "trophies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_trophies_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          bio: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          profile_platform: string | null;
          updated_at: string;
        };
        Insert: {
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          profile_platform?: string | null;
          updated_at?: string;
        };
        Update: {
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          profile_platform?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          display_name: string | null;
          earned_bronze: number | null;
          earned_gold: number | null;
          earned_platinum: number | null;
          earned_silver: number | null;
          id: string | null;
          profile_avatar_url: string | null;
          profile_name: string | null;
          profile_platform: string | null;
          psn_online_id: string | null;
          steam_avatar_url: string | null;
          steam_persona_name: string | null;
          trophy_level: number | null;
          trophy_progress: number | null;
        };
        Relationships: [];
      };
      game_scores: {
        Row: {
          average_rating: number | null;
          game_id: string | null;
          rating_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_diary_entries_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      get_activity_friends: {
        Args: {
          before_at?: string;
          before_id?: string;
          max_rows?: number;
          kinds?: string[];
        };
        Returns: {
          id: string;
          kind: string;
          occurred_at: string;
          actor_id: string;
          game_id: string | null;
          list_id: string | null;
          entry_id: string | null;
          rating: number | null;
          finished_on: string | null;
        }[];
      };
      get_activity_received: {
        Args: {
          before_at?: string;
          before_id?: string;
          max_rows?: number;
          kinds?: string[];
        };
        Returns: {
          id: string;
          kind: string;
          occurred_at: string;
          actor_id: string;
          game_id: string | null;
          list_id: string | null;
          entry_id: string | null;
          rating: number | null;
          finished_on: string | null;
        }[];
      };
      get_activity_self: {
        Args: {
          before_at?: string;
          before_id?: string;
          max_rows?: number;
          kinds?: string[];
        };
        Returns: {
          id: string;
          kind: string;
          occurred_at: string;
          actor_id: string;
          game_id: string | null;
          list_id: string | null;
          entry_id: string | null;
          rating: number | null;
          finished_on: string | null;
        }[];
      };
      get_library_trophy_stats: {
        Args: never;
        Returns: {
          bronze: number;
          game_id: string;
          gold: number;
          obtained: number;
          platinum: number;
          silver: number;
          total: number;
        }[];
      };
      get_post_stats: {
        Args: { post_ids: string[] };
        Returns: {
          post_id: string;
          like_count: number;
          comment_count: number;
          liked_by_me: boolean;
        }[];
      };
      post_media_orphans: {
        Args: { older_than: string; max_rows: number };
        Returns: { name: string }[];
      };
      refresh_system_lists: {
        Args: { p_max_items: number; p_min_items: number; p_min_ratings: number };
        Returns: number;
      };
      save_recent_search: {
        Args: { p_max: number; p_query: string; p_scope: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
