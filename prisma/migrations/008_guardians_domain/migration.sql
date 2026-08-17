-- ====================================================================
-- Migration: 008_guardians_domain
-- Module: Guardian Domain & Student-Guardian Relations
-- Strategy: Strict Scope Isolation, AES-256 PII, HMAC-SHA256 Blind Indexing,
--           Partial Unique Indexes on Active Records, and ON DELETE RESTRICT
-- ====================================================================

-- 1. Create Enums
CREATE TYPE  GuardianStatus AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE GuardianRelationshipType AS ENUM (
    'FATHER',
    'MOTHER',
    'LEGAL_GUARDIAN',
    'BROTHER',
    'SISTER',
    'UNCLE',
    'AUNT',
    'GRANDPARENT',
    'OTHER'
);

-- 2. Create Guardians Table
CREATE TABLE guardians (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    first_name_ar VARCHAR(100) NOT NULL,
    second_name_ar VARCHAR(100),
    third_name_ar VARCHAR(100),
    family_name_ar VARCHAR(100) NOT NULL,
    full_name_ar VARCHAR(400) NOT NULL,
    full_name_en VARCHAR(400),
    nationality VARCHAR(100),
    occupation VARCHAR(150),
    workplace VARCHAR(200),
    status GuardianStatus NOT NULL DEFAULT 'ACTIVE',
    
    -- Encrypted PII Fields (AES-256-GCM)
    national_id_encrypted TEXT NOT NULL,
    phone_encrypted TEXT NOT NULL,
    email_encrypted TEXT,
    
    -- HMAC-SHA256 Blind Indexes (Deterministic Search with Secret Salt)
    national_id_hash VARCHAR(64) NOT NULL,
    phone_hash VARCHAR(64) NOT NULL,
    email_hash VARCHAR(64),
    
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP(3),

    CONSTRAINT guardians_pkey PRIMARY KEY (id)
);

-- 3. Create StudentGuardians Table
CREATE TABLE student_guardians (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    student_id UUID NOT NULL,
    guardian_id UUID NOT NULL,
    relationship_type GuardianRelationshipType NOT NULL DEFAULT 'FATHER',
    is_primary BOOLEAN NOT NULL DEFAULT true,
    is_emergency_contact BOOLEAN NOT NULL DEFAULT true,
    is_financially_responsible BOOLEAN NOT NULL DEFAULT true,
    has_pickup_authorization BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP(3),

    CONSTRAINT student_guardians_pkey PRIMARY KEY (id)
);

-- 4. Partial Unique Indexes for Active Records (WHERE deleted_at IS NULL)

-- A) Ì„‰⁄  ﬂ—«— —ﬁ„ ÂÊÌ… Ê·Ì «·√„— «·‰‘ÿ œ«Œ· ‰›” «·„œ—”…° ÊÌ”„Õ »≈⁄«œ… «· ›⁄Ì· »⁄œ «·Õ–› «·„‰ÿﬁÌ
CREATE UNIQUE INDEX guardians_school_active_national_id_unique_idx
ON guardians(school_id, national_id_hash)
WHERE deleted_at IS NULL;

-- B) Ì„‰⁄  ﬂ—«— —»ÿ ‰›” Ê·Ì «·√„— »«·ÿ«·» ··⁄·«ﬁ«  «·‰‘ÿ…° ÊÌ”„Õ »≈⁄«œ… «·—»ÿ »⁄œ «·Õ–› «·„‰ÿﬁÌ
CREATE UNIQUE INDEX student_guardians_active_unique_idx 
ON student_guardians(student_id, guardian_id) 
WHERE deleted_at IS NULL;

-- 5. Multi-Tenancy, Performance & Soft-Delete Supporting Indexes
CREATE INDEX guardians_school_id_national_id_hash_idx ON guardians(school_id, national_id_hash);
CREATE INDEX guardians_school_id_phone_hash_idx ON guardians(school_id, phone_hash);
CREATE INDEX guardians_school_id_full_name_ar_idx ON guardians(school_id, full_name_ar);
CREATE INDEX guardians_deleted_at_idx ON guardians(deleted_at);

CREATE INDEX student_guardians_school_id_student_id_idx ON student_guardians(school_id, student_id);
CREATE INDEX student_guardians_school_id_guardian_id_idx ON student_guardians(school_id, guardian_id);
CREATE INDEX student_guardians_deleted_at_idx ON student_guardians(deleted_at);

-- 6. Foreign Key Constraints (Strict Historical Protection with ON DELETE RESTRICT)
ALTER TABLE guardians 
ADD CONSTRAINT guardians_school_id_fkey 
FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE student_guardians 
ADD CONSTRAINT student_guardians_school_id_fkey 
FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE student_guardians 
ADD CONSTRAINT student_guardians_student_id_fkey 
FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE student_guardians 
ADD CONSTRAINT student_guardians_guardian_id_fkey 
FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE RESTRICT ON UPDATE CASCADE;
