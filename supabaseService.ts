
import { supabase } from './supabaseClient';
import { FileSystemItem, User } from './AppContext';

// --- ITEMS (Files/Folders) ---

export const fetchItems = async (): Promise<FileSystemItem[]> => {
  const { data, error } = await supabase
    .from('items')
    .select('*');

  if (error) {
    console.error('Error fetching items:', error);
    return [];
  }

  // Map snake_case DB fields to camelCase TS fields
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    fileType: item.file_type,
    size: item.size,
    parentId: item.parent_id,
    s3Key: item.s3_key,
    previewUrl: item.preview_url,
    tags: item.tags || [],
    description: item.description,
    rating: item.rating,
    flag: item.flag,
    width: item.width,
    height: item.height,
    make: item.make,
    model: item.model,
    dateTaken: item.date_taken ? new Date(item.date_taken).getTime() : undefined,
    dateAdded: item.date_added ? new Date(item.date_added).getTime() : Date.now(),
    syncStatus: item.sync_status,
    videoMetadata: item.video_metadata,
    proxyS3Key: item.proxy_s3_key,
    groupId: item.group_id,
    isStackTop: item.is_stack_top,
    isAnalyzing: item.is_analyzing
  }));
};

export const upsertItem = async (item: FileSystemItem) => {
  const dbItem = {
    id: item.id,
    user_id: (await supabase.auth.getUser()).data.user?.id,
    name: item.name,
    type: item.type,
    file_type: item.fileType,
    size: item.size,
    parent_id: item.parentId || null,
    s3_key: item.s3Key,
    preview_url: item.previewUrl,
    tags: item.tags,
    description: item.description,
    rating: item.rating,
    flag: item.flag,
    width: item.width,
    height: item.height,
    make: item.make,
    model: item.model,
    date_taken: item.dateTaken ? new Date(item.dateTaken).toISOString() : null,
    sync_status: item.syncStatus,
    video_metadata: item.videoMetadata,
    proxy_s3_key: item.proxyS3Key,
    group_id: item.groupId,
    is_stack_top: item.isStackTop,
    is_analyzing: item.isAnalyzing
  };

  const { error } = await supabase
    .from('items')
    .upsert(dbItem);

  if (error) console.error('Error upserting item:', error);
};

export const updateItemInDB = async (id: string, updates: Partial<FileSystemItem>) => {
  const dbUpdates: any = {};
  
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.fileType !== undefined) dbUpdates.file_type = updates.fileType;
  if (updates.size !== undefined) dbUpdates.size = updates.size;
  if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId;
  if (updates.s3Key !== undefined) dbUpdates.s3_key = updates.s3Key;
  if (updates.previewUrl !== undefined) dbUpdates.preview_url = updates.previewUrl;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
  if (updates.flag !== undefined) dbUpdates.flag = updates.flag;
  if (updates.width !== undefined) dbUpdates.width = updates.width;
  if (updates.height !== undefined) dbUpdates.height = updates.height;
  if (updates.make !== undefined) dbUpdates.make = updates.make;
  if (updates.model !== undefined) dbUpdates.model = updates.model;
  if (updates.dateTaken !== undefined) dbUpdates.date_taken = updates.dateTaken ? new Date(updates.dateTaken).toISOString() : null;
  if (updates.syncStatus !== undefined) dbUpdates.sync_status = updates.syncStatus;
  if (updates.videoMetadata !== undefined) dbUpdates.video_metadata = updates.videoMetadata;
  if (updates.proxyS3Key !== undefined) dbUpdates.proxy_s3_key = updates.proxyS3Key;
  if (updates.groupId !== undefined) dbUpdates.group_id = updates.groupId;
  if (updates.isStackTop !== undefined) dbUpdates.is_stack_top = updates.isStackTop;
  if (updates.isAnalyzing !== undefined) dbUpdates.is_analyzing = updates.isAnalyzing;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase
    .from('items')
    .update(dbUpdates)
    .eq('id', id);

  if (error) console.error('Error updating item:', error);
};

export const deleteItemFromDB = async (id: string) => {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id);

  if (error) console.error('Error deleting item:', error);
};

// --- USER PROFILE ---

export const fetchUserProfile = async (): Promise<Partial<User> | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) return null;

  return {
    username: data.username || user.email?.split('@')[0],
    email: user.email!,
    plan: data.plan || 'Free',
    avatarUrl: data.avatar_url
  };
};
