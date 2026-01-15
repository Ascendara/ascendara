# This script scans the src directory for translation keys used in files and reports unused keys

import json
import os
import re
import shutil
from datetime import datetime
from typing import Set, Dict, Any

def flatten_dict(d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, str]:
    """Flatten a nested dictionary, joining keys with dots."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, str(v)))
    return dict(items)

def unflatten_dict(flat_dict: Dict[str, str], sep: str = '.') -> Dict[str, Any]:
    """Convert a flattened dictionary back to nested format."""
    result = {}
    for key, value in flat_dict.items():
        parts = key.split(sep)
        target = result
        for part in parts[:-1]:
            target = target.setdefault(part, {})
        target[parts[-1]] = value
    return result

def get_all_translation_keys(json_file: str) -> Dict[str, str]:
    """Read and flatten the translation JSON file."""
    with open(json_file, 'r', encoding='utf-8') as f:
        translations = json.load(f)
    return flatten_dict(translations)

def find_translation_keys_in_file(file_path: str, all_keys: Set[str]) -> Set[str]:
    """Find all translation keys used in a file."""
    found_keys = set()
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Look for common translation patterns
        # Pattern 1: t('key.subkey')
        matches = re.findall(r"t\(['\"]([^'\"]+)['\"]\)", content)
        found_keys.update(matches)
        
        # Pattern 2: t(`key.subkey.${variable}`) - template literals with dynamic parts
        # Find base patterns like t(`welcome.referral.sources.${source}`)
        template_matches = re.findall(r"t\(`([^`$]+)\$\{[^}]+\}[^`]*`\)", content)
        for base_pattern in template_matches:
            # Find all keys that start with this base pattern
            for key in all_keys:
                if key.startswith(base_pattern):
                    found_keys.add(key)
        
        # Pattern 3: t(`${variable}.key.subkey`) - dynamic prefix
        template_suffix_matches = re.findall(r"t\(`\$\{[^}]+\}\.([^`]+)`\)", content)
        for suffix_pattern in template_suffix_matches:
            for key in all_keys:
                if key.endswith(suffix_pattern):
                    found_keys.add(key)
        
        # Pattern 4: "key.subkey" - literal string references
        for key in all_keys:
            if f'"{key}"' in content or f"'{key}'" in content:
                found_keys.add(key)
                
    except Exception as e:
        print(f"Warning: Could not process {file_path}: {str(e)}")
    
    return found_keys

def scan_directory(directory: str, all_keys: Set[str]) -> Set[str]:
    """Recursively scan directory for translation keys."""
    found_keys = set()
    
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.vue')):
                file_path = os.path.join(root, file)
                found_keys.update(find_translation_keys_in_file(file_path, all_keys))
                
    return found_keys

def create_backup(file_path: str) -> str:
    """Create a backup of the original file with timestamp."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{file_path}.{timestamp}.backup"
    shutil.copy2(file_path, backup_path)
    return backup_path

def remove_unused_keys(translations_file: str, unused_keys: Set[str]) -> None:
    """Remove unused keys from the translation file."""
    with open(translations_file, 'r', encoding='utf-8') as f:
        translations = json.load(f)
    
    # Flatten the dictionary
    flat_translations = flatten_dict(translations)
    
    # Remove unused keys
    for key in unused_keys:
        flat_translations.pop(key, None)
    
    # Unflatten the dictionary back to its original structure
    cleaned_translations = unflatten_dict(flat_translations)
    
    # Write the cleaned translations back to the file with proper formatting
    with open(translations_file, 'w', encoding='utf-8') as f:
        json.dump(cleaned_translations, f, indent=2, ensure_ascii=False)

def main():
    # Paths
    translations_file = os.path.join('src', 'translations', 'en.json')
    src_directory = 'src'
    
    # Keys to always ignore (they exist but aren't explicitly referenced in code)
    ignored_keys = {
        "download.newUserGuide.steps"  # This key exists but is not explicitly defined
    }
    
    # Get all translation keys
    translation_dict = get_all_translation_keys(translations_file)
    all_keys = set(translation_dict.keys())
    
    # Find used keys
    used_keys = scan_directory(src_directory, all_keys)
    
    # Add ignored keys to the used keys to prevent them from being reported as unused
    used_keys.update(ignored_keys)
    
    # Find unused keys
    unused_keys = all_keys - used_keys
    
    # Report results
    print(f"\nFound {len(unused_keys)} unused translation keys:")
    print("-" * 50)
    
    for key in sorted(unused_keys):
        print(f"Key: {key}")
        print(f"Value: {translation_dict[key]}")
        print("-" * 50)
        
    print(f"\nTotal translations: {len(all_keys)}")
    print(f"Used translations: {len(used_keys)}")
    print(f"Unused translations: {len(unused_keys)}")
    
    if unused_keys:
        response = input("\nWould you like to remove these unused keys? (yes/no): ").lower().strip()
        if response == 'yes':
            # Create backup first
            backup_path = create_backup(translations_file)
            print(f"\nBackup created at: {backup_path}")
            
            # Remove unused keys
            remove_unused_keys(translations_file, unused_keys)
            print(f"\nSuccessfully removed {len(unused_keys)} unused translation keys.")
            print("The translation file has been updated.")
        else:
            print("\nNo changes were made to the translation file.")

if __name__ == "__main__":
    main()
