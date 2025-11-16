export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      hotels: {
        Row: {
          address: string
          beach: string | null
          beach_distance: string | null
          city: string | null
          created_at: string
          description: string
          eat: string[] | null
          features: string[] | null
          id: string
          image_id: string | null
          phone: string
          rating: number | null
          telegram_url: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          address: string
          beach?: string | null
          beach_distance?: string | null
          city?: string | null
          created_at?: string
          description: string
          eat?: string[] | null
          features?: string[] | null
          id?: string
          image_id?: string | null
          phone: string
          rating?: number | null
          telegram_url?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          address?: string
          beach?: string | null
          beach_distance?: string | null
          city?: string | null
          created_at?: string
          description?: string
          eat?: string[] | null
          features?: string[] | null
          id?: string
          image_id?: string | null
          phone?: string
          rating?: number | null
          telegram_url?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      reserves: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          edited_at: string | null
          edited_by: string | null
          end: number
          guest: string
          id: string
          phone: string
          prepayment: string | null
          price: number
          quantity: number
          room_id: string
          start: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          end: number
          guest: string
          id?: string
          phone: string
          prepayment?: string | null
          price: number
          quantity: number
          room_id: string
          start: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by?: string | null
          end?: number
          guest?: string
          id?: string
          phone?: string
          prepayment?: string | null
          price?: number
          quantity?: number
          room_id?: string
          start?: number
        }
        Relationships: [
          {
            foreignKeyName: "reserves_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          comment: string | null
          created_at: string
          hotel_id: string
          id: string
          image_path: string
          image_title: string
          order: number | null
          price: number
          quantity: number
          room_features: string[] | null
          title: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          hotel_id: string
          id?: string
          image_path: string
          image_title: string
          order?: number | null
          price: number
          quantity: number
          room_features?: string[] | null
          title: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          hotel_id?: string
          id?: string
          image_path?: string
          image_title?: string
          order?: number | null
          price?: number
          quantity?: number
          room_features?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels_with_rooms_new"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      hotels_with_rooms_new: {
        Row: {
          address: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_id: string | null
          phone: string | null
          rating: number | null
          rooms_count: number | null
          telegram_url: string | null
          title: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_available_hotels: {
        Args: {
          beach_distance_filter?: string[]
          beach_filter?: string[]
          city_filter?: string[]
          eat_filter?: string[]
          end_time?: number
          features_filter?: string[]
          hotel_type_filter?: string
          max_price_filter?: number
          min_price_filter?: number
          min_quantity_filter?: number
          room_features_filter?: string[]
          start_time?: number
        }
        Returns: {
          hotel_id: string
          hotel_title: string
          hotel_type: string
          rooms: Json
        }[]
      }
      get_hotel_room_reserve_counts: {
        Args: never
        Returns: {
          hotel_count: number
          reserve_count: number
          room_count: number
        }[]
      }
      get_hotels_with_free_rooms_in_period: {
        Args: { end_time: number; start_time: number }
        Returns: {
          free_room_count: number
          hotel_id: string
          hotel_title: string
          rooms: Json
        }[]
      }
      get_raw_user_meta_data: { Args: never; Returns: Json[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
