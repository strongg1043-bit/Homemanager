import { collection, addDoc, serverTimestamp, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationType } from '../types';

export async function createNotification(
  householdId: string,
  recipientId: string,
  recipientRole: 'parent' | 'child',
  type: NotificationType,
  title: string,
  message: string,
  emoji: string,
  relatedIds?: { taskId?: string; redemptionId?: string }
) {
  try {
    await addDoc(collection(db, 'households', householdId, 'notifications'), {
      householdId,
      recipientId,
      recipientRole,
      type,
      title,
      message,
      emoji,
      read: false,
      createdAt: serverTimestamp(),
      relatedTaskId: relatedIds?.taskId || null,
      relatedRedemptionId: relatedIds?.redemptionId || null,
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

export async function markAllRead(householdId: string, recipientId: string) {
  try {
    const q = query(
      collection(db, 'households', householdId, 'notifications'),
      where('recipientId', '==', recipientId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.update(doc(db, 'households', householdId, 'notifications', d.id), {
        read: true,
      });
    });
    await batch.commit();
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
}
