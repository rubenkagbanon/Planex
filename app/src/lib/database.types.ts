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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annees_archivees: {
        Row: {
          annee_scolaire: string
          created_at: string
          created_by: string | null
          donnees: Json
          etablissement_id: string
          id: string
          nb_classes: number
          nb_professeurs: number
          nb_seances: number
          origine: string
          seances: Json
          versions: Json
        }
        Insert: {
          annee_scolaire: string
          created_at?: string
          created_by?: string | null
          donnees?: Json
          etablissement_id: string
          id?: string
          nb_classes?: number
          nb_professeurs?: number
          nb_seances?: number
          origine?: string
          seances?: Json
          versions?: Json
        }
        Update: {
          annee_scolaire?: string
          created_at?: string
          created_by?: string | null
          donnees?: Json
          etablissement_id?: string
          id?: string
          nb_classes?: number
          nb_professeurs?: number
          nb_seances?: number
          origine?: string
          seances?: Json
          versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "annees_archivees_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      classes_etablissement: {
        Row: {
          etablissement_id: string
          id: string
          niveau: string
          nombre_classes: number
          updated_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          niveau: string
          nombre_classes?: number
          updated_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          niveau?: string
          nombre_classes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_etablissement_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      creneaux_horaires: {
        Row: {
          created_at: string
          cycle: string
          etablissement_id: string
          heure_debut: string
          heure_fin: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          cycle: string
          etablissement_id: string
          heure_debut: string
          heure_fin: string
          id?: string
          type: string
        }
        Update: {
          created_at?: string
          cycle?: string
          etablissement_id?: string
          heure_debut?: string
          heure_fin?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "creneaux_horaires_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      emploi_du_temps: {
        Row: {
          created_at: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id: string
          jour: string
          matiere: string
          niveau: string
          professeur_id: string
          salle_id: string | null
          verrouille: boolean
          groupe_seance: string | null
          section: number
        }
        Insert: {
          created_at?: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id?: string
          jour: string
          matiere: string
          niveau: string
          professeur_id: string
          salle_id?: string | null
          verrouille?: boolean
          groupe_seance?: string | null
          section: number
        }
        Update: {
          created_at?: string
          creneau_id?: string
          cycle?: string
          etablissement_id?: string
          id?: string
          jour?: string
          matiere?: string
          niveau?: string
          professeur_id?: string
          salle_id?: string | null
          verrouille?: boolean
          groupe_seance?: string | null
          section?: number
        }
        Relationships: [
          {
            foreignKeyName: "emploi_du_temps_creneau_id_fkey"
            columns: ["creneau_id"]
            isOneToOne: false
            referencedRelation: "creneaux_horaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emploi_du_temps_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emploi_du_temps_professeur_id_fkey"
            columns: ["professeur_id"]
            isOneToOne: false
            referencedRelation: "professeurs"
            referencedColumns: ["id"]
          },
        ]
      }
      etablissements: {
        Row: {
          created_at: string
          id: string
          name: string
          code_invitation: string
          code_etablissement: string | null
          statut: string | null
          drena: string | null
          ministere: string | null
          adresse: string | null
          telephone: string | null
          email: string | null
          annee_scolaire: string | null
          signataire_nom: string | null
          signataire_titre: string | null
          created_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          code_invitation?: string
          code_etablissement?: string | null
          statut?: string | null
          drena?: string | null
          ministere?: string | null
          adresse?: string | null
          telephone?: string | null
          email?: string | null
          annee_scolaire?: string | null
          signataire_nom?: string | null
          signataire_titre?: string | null
          created_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          code_invitation?: string
          code_etablissement?: string | null
          statut?: string | null
          drena?: string | null
          ministere?: string | null
          adresse?: string | null
          telephone?: string | null
          email?: string | null
          annee_scolaire?: string | null
          signataire_nom?: string | null
          signataire_titre?: string | null
          created_by?: string | null
        }
        Relationships: []
      }
      horaires_contraintes: {
        Row: {
          couleur_matieres: boolean
          creneau_egale_heure: boolean
          cycle: string
          etablissement_id: string
          id: string
          jours_cours: string[]
          mercredi_apres_midi_banalise: boolean
          regles: Json
          updated_at: string
        }
        Insert: {
          couleur_matieres?: boolean
          creneau_egale_heure?: boolean
          cycle?: string
          etablissement_id: string
          id?: string
          jours_cours?: string[]
          mercredi_apres_midi_banalise?: boolean
          regles?: Json
          updated_at?: string
        }
        Update: {
          couleur_matieres?: boolean
          creneau_egale_heure?: boolean
          cycle?: string
          etablissement_id?: string
          id?: string
          jours_cours?: string[]
          mercredi_apres_midi_banalise?: boolean
          regles?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horaires_contraintes_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      horaires_reference: {
        Row: {
          discipline: string
          etablissement_id: string
          id: string
          niveau: string
          updated_at: string
          valeur: string
        }
        Insert: {
          discipline: string
          etablissement_id: string
          id?: string
          niveau: string
          updated_at?: string
          valeur?: string
        }
        Update: {
          discipline?: string
          etablissement_id?: string
          id?: string
          niveau?: string
          updated_at?: string
          valeur?: string
        }
        Relationships: [
          {
            foreignKeyName: "horaires_reference_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      professeur_indisponibilites: {
        Row: {
          created_at: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id: string
          jour: string
          nom_complet: string
        }
        Insert: {
          created_at?: string
          creneau_id: string
          cycle: string
          etablissement_id: string
          id?: string
          jour: string
          nom_complet: string
        }
        Update: {
          created_at?: string
          creneau_id?: string
          cycle?: string
          etablissement_id?: string
          id?: string
          jour?: string
          nom_complet?: string
        }
        Relationships: [
          {
            foreignKeyName: "professeur_indisponibilites_creneau_id_fkey"
            columns: ["creneau_id"]
            isOneToOne: false
            referencedRelation: "creneaux_horaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professeur_indisponibilites_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      professeurs: {
        Row: {
          etablissement_id: string
          id: string
          matiere: string
          niveaux: string[]
          nom_complet: string
          remarque: string | null
          updated_at: string
          volume_horaire: number
        }
        Insert: {
          etablissement_id: string
          id?: string
          matiere: string
          niveaux?: string[]
          nom_complet: string
          remarque?: string | null
          updated_at?: string
          volume_horaire?: number
        }
        Update: {
          etablissement_id?: string
          id?: string
          matiere?: string
          niveaux?: string[]
          nom_complet?: string
          remarque?: string | null
          updated_at?: string
          volume_horaire?: number
        }
        Relationships: [
          {
            foreignKeyName: "professeurs_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          etablissement_id: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          etablissement_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          etablissement_id?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      classes_details: {
        Row: {
          etablissement_id: string
          id: string
          niveau: string
          section: number
          professeur_principal: string | null
          salle_id: string | null
          updated_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          niveau: string
          section: number
          professeur_principal?: string | null
          salle_id?: string | null
          updated_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          niveau?: string
          section?: number
          professeur_principal?: string | null
          salle_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_details_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      emploi_du_temps_versions: {
        Row: {
          etablissement_id: string
          id: string
          label: string
          nb_seances: number
          seances: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          label: string
          nb_seances?: number
          seances?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          label?: string
          nb_seances?: number
          seances?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emploi_du_temps_versions_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          etablissement_id: string
          id: string
          total_charges: number
          total_placees: number
          nb_verrouillees: number
          warnings: Json
          entorses: Json
          created_by: string | null
          created_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          total_charges?: number
          total_placees?: number
          nb_verrouillees?: number
          warnings?: Json
          entorses?: Json
          created_by?: string | null
          created_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          total_charges?: number
          total_placees?: number
          nb_verrouillees?: number
          warnings?: Json
          entorses?: Json
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      matieres_salles: {
        Row: {
          etablissement_id: string
          id: string
          matiere: string
          type_salle: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          matiere: string
          type_salle: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          matiere?: string
          type_salle?: string
        }
        Relationships: [
          {
            foreignKeyName: "matieres_salles_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      regroupements: {
        Row: {
          etablissement_id: string
          id: string
          type: string
          libelle: string | null
          matieres: string[]
          classes: string[]
          created_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          type: string
          libelle?: string | null
          matieres: string[]
          classes: string[]
          created_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          type?: string
          libelle?: string | null
          matieres?: string[]
          classes?: string[]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regroupements_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
      salles: {
        Row: {
          etablissement_id: string
          id: string
          nom: string
          type: string
          capacite: number
          created_at: string
        }
        Insert: {
          etablissement_id: string
          id?: string
          nom: string
          type?: string
          capacite?: number
          created_at?: string
        }
        Update: {
          etablissement_id?: string
          id?: string
          nom?: string
          type?: string
          capacite?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salles_etablissement_id_fkey"
            columns: ["etablissement_id"]
            isOneToOne: false
            referencedRelation: "etablissements"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      completer_inscription: {
        Args: { p_first_name: string; p_last_name: string; p_etablissement?: string; p_code_invitation?: string }
        Returns: undefined
      }
      appliquer_deplacements: { Args: { p_deplacements: Json }; Returns: undefined }
      supprimer_donnees_etablissement: { Args: { p_avec_bibliotheque?: boolean }; Returns: undefined }
      cloturer_annee: {
        Args: { p_nouvelle_annee: string; p_vider_emploi_du_temps?: boolean; p_vider_professeurs_principaux?: boolean }
        Returns: string
      }
      definir_role_membre: { Args: { p_user_id: string; p_role: string }; Returns: undefined }
      enregistrer_version: { Args: { p_label: string }; Returns: string | null }
      etablissement_nom_disponible: { Args: { p_nom: string }; Returns: boolean }
      est_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      mon_etablissement_id: { Args: Record<PropertyKey, never>; Returns: string | null }
      regenerer_code_invitation: { Args: Record<PropertyKey, never>; Returns: string }
      restaurer_version: { Args: { p_version_id: string }; Returns: number }
      retirer_membre: { Args: { p_user_id: string }; Returns: undefined }
      verifier_code_invitation: { Args: { p_code: string }; Returns: string | null }
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
