"""
Pro Description Templates - 500+ word SEO Articles
Structure: Hook → Story → Action → Climax → CTA → Tags
Malay/Eng mix, H3 sections, video-specific
"""

PRO_DESCRIPTION_TEMPLATES = {
    "hooks": [
        "🔥 <strong>EXCLUSIVE VIRAL ALERT!</strong> {country_flag} {subject} scandal yang buat seluruh {country_context} tegang! Jangan miss momen paling panas ni!",
        "💋 <strong>NEW DROP!</strong> Tengok {subject} yang jadi <strong>trending #1</strong> dekat {country_context}. Aksi {action} sampai {reaction}!",
        "⭐ <strong>INSIDE STORY!</strong> Apa sebenar berlaku dengan {adj} {subject} dekat {location}? Full details dalam video ni!",
        "📺 <strong>HD PREMIUM!</strong> {subject} tunjuk semua skill depaorg dalam <strong>full HD quality</strong>. Experience tak sama!",
        "🎬 <strong>UNCENSORED!</strong> {country_flag} content paling {adj} yang korang pernah tengok. Straight from source!"
    ],
    
    "story_openers": [
        "Semua bermula dekat {location} semasa {subject} rasa paling {adj}. De paorg tak expect apa yang akan jadi, tapi semuanya berubah bila {action} bermula dengan penuh <strong>passion</strong>.",
        "Malam tu dekat {location}, {subject} decided untuk let go semua inhibition. Dari slow start sampai jadi totally {adj}, every moment recorded dengan perfect clarity.",
        "Story ni tak biasa - {subject} dari {country_context} yang nampak biasa tapi bila {action}, semua orang shocked dengan level {adj} depaorg.",
        "Bayangkan korang dekat {location}, tengok {subject} slowly buka semua rahsia depaorg. The build-up sampai peak semua buat korang tak boleh blah!",
        "{subject} ni bukan macam biasa - ada story di sebalik kenapa depaorg {action} dengan begitu {adj}. Full context dalam video!"
    ],
    
    "action_sections": [
        "Every <strong>{action}</strong> buat semua orang rasa macam ada dekat situ. The way {subject} handle each moment dengan <strong>expertise</strong> memang top class.",
        "No script, pure natural {action}. {subject} tunjuk kenapa depaorg deserve to be {adj} icon dekat {country_context}.",
        "Chemistry begitu <strong>electrifying</strong> - every touch, every movement semua synchronized perfectly. This is what real {adj} looks like!",
        "The techniques used sangat <strong>advanced</strong>. {subject} combine traditional {country_context} style dengan modern flair sampai jadi unique experience.",
        "Peak moment bila {action} sampai tahap yang tak dapat control. {subject} give 100% effort, result adalah <strong>mind-blowing</strong>!"
    ],
    
    "climax_sections": [
        "Bila semua tenaga dah max, {subject} buat something yang tak dapat predict. The finale buat semua orang <strong>{reaction}</strong> - epic tak berkata-kata!",
        "Climax semua tu combine semua element perfect - technique, passion, chemistry. Hasil ialah pengalaman {adj} yang tak dapat lupakan.",
        "When everything reach peak intensity, the raw emotion semua keluar. {subject} tunjuk kenapa video ni deserve to be viral worldwide!",
        "Final moments penuh dengan <strong>drama and satisfaction</strong>. {subject} capai level yang buat semua penonton rasa satisfied completely.",
        "The ending totally unexpected tapi perfect. {subject} leave nothing behind, buat semua orang nak tengok lagi dan lagi!"
    ],
    
    "ctas": [
        "🎯 <strong>WATCH FULL VIDEO NOW!</strong> Experience semua momen dalam <strong>HD 1080p</strong>. No buffering, smooth streaming untuk best experience!",
        "💎 <strong>DON'T MISS!</strong> Limited time access untuk {adj} content macam ni. Click play dan rasa sendiri kenapa semua orang viralkan video ni!",
        "📱 <strong>MOBILE FRIENDLY!</strong> Watch anytime anywhere dekat phone, tablet atau PC. Optimized untuk semua device!",
        "⭐ <strong>100% UNCENSORED!</strong> Full length, original quality straight from source. No edit, no cut!",
        "🔥 <strong>TRENDING NOW!</strong> Join ribuan viewers yang dah tengok. Jadi sebahagian dari viral wave ni!"
    ],
    
    "seo_boosters": [
        "Related searches: {keywords} video full HD, {subject} {country_context} viral, {action} {adj} complete.",
        "Popular tags: {tags}",
        "Watch juga: {related_videos}"
    ]
}


def get_template_text(template, **kwargs):
    """
    Format a template with provided variables
    
    Args:
        template (str): Template string with placeholders
        **kwargs: Variables to substitute in template
    
    Returns:
        str: Formatted template string
    
    Example:
        text = get_template_text(
            PRO_DESCRIPTION_TEMPLATES['hooks'][0],
            country_flag='🇲🇾',
            subject='Awek Tudung',
            country_context='Malaysia',
            reaction='gila'
        )
    """
    return template.format(**kwargs)


def generate_description(
    hook_idx=0,
    story_idx=0,
    action_idx=0,
    climax_idx=0,
    cta_idx=0,
    seo_idx=None,
    **variables
):
    """
    Generate complete description by combining template sections
    
    Args:
        hook_idx (int): Index of hook template
        story_idx (int): Index of story opener template
        action_idx (int): Index of action section template
        climax_idx (int): Index of climax section template
        cta_idx (int): Index of CTA template
        seo_idx (list): Indices for SEO boosters
        **variables: Template variables (country_flag, subject, location, etc.)
    
    Returns:
        str: Complete formatted description
    """
    sections = []
    
    # Add hook
    if 0 <= hook_idx < len(PRO_DESCRIPTION_TEMPLATES['hooks']):
        sections.append(get_template_text(
            PRO_DESCRIPTION_TEMPLATES['hooks'][hook_idx],
            **variables
        ))
    
    # Add story opener
    if 0 <= story_idx < len(PRO_DESCRIPTION_TEMPLATES['story_openers']):
        sections.append(get_template_text(
            PRO_DESCRIPTION_TEMPLATES['story_openers'][story_idx],
            **variables
        ))
    
    # Add action section
    if 0 <= action_idx < len(PRO_DESCRIPTION_TEMPLATES['action_sections']):
        sections.append(get_template_text(
            PRO_DESCRIPTION_TEMPLATES['action_sections'][action_idx],
            **variables
        ))
    
    # Add climax section
    if 0 <= climax_idx < len(PRO_DESCRIPTION_TEMPLATES['climax_sections']):
        sections.append(get_template_text(
            PRO_DESCRIPTION_TEMPLATES['climax_sections'][climax_idx],
            **variables
        ))
    
    # Add CTA
    if 0 <= cta_idx < len(PRO_DESCRIPTION_TEMPLATES['ctas']):
        sections.append(get_template_text(
            PRO_DESCRIPTION_TEMPLATES['ctas'][cta_idx],
            **variables
        ))
    
    # Add SEO boosters
    if seo_idx:
        for idx in seo_idx:
            if 0 <= idx < len(PRO_DESCRIPTION_TEMPLATES['seo_boosters']):
                sections.append(get_template_text(
                    PRO_DESCRIPTION_TEMPLATES['seo_boosters'][idx],
                    **variables
                ))
    
    return "\n\n".join(sections)


if __name__ == "__main__":
    # Example usage
    sample_variables = {
        "country_flag": "🇲🇾",
        "subject": "Awek Tudung",
        "country_context": "Malaysia",
        "location": "backstage",
        "adj": "gila",
        "action": "main",
        "reaction": "terkejut",
        "keywords": "tudung, awek, scandal, viral",
        "tags": "tudung awek scandal viral",
        "related_videos": "Video 1, Video 2, Video 3"
    }
    
    # Generate a sample description
    description = generate_description(
        hook_idx=0,
        story_idx=0,
        action_idx=0,
        climax_idx=0,
        cta_idx=0,
        seo_idx=[0, 1, 2],
        **sample_variables
    )
    
    print(description)
